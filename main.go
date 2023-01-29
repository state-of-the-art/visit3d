package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-jose/go-jose/v3"
)

type JWTData struct {
	Id       int
	UserName string
}

type DocumentBody struct {
	UserId   int    // Will be set from the token data
	UserName string // Will be set from the token data

	Version uint           // To find which processor to use to process data
	Data    map[string]any // The data passed by javascript in the document
}

var (
	// Required argv params
	listen_address string // Where to listen on, could be ":8888" or with host or ip "localhost:8888"
	endpoint_url   string // What is the frontend url to redirect the user to, like "https://site.com/"

	// Optional argv params
	save_dir string // Path to writable directory to create files with user data

	// Other vars
	static_fs http.Handler
)

func moveTokenToCookie(w http.ResponseWriter, r *http.Request) bool {
	token := r.URL.Query().Get("t")
	if token == "" {
		return false
	}

	// Set token cookie valid for a year
	token_cookie := http.Cookie{Name: "token", Value: token, Expires: time.Now().AddDate(1, 0, 0)}
	http.SetCookie(w, &token_cookie)

	http.Redirect(w, r, endpoint_url, http.StatusTemporaryRedirect)

	return true
}

func verifyJWT(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// If token is in the query - move it to the headers
		if moveTokenToCookie(w, r) {
			return
		}

		// Check if the token is specified
		token, err := r.Cookie("token")
		if err == nil {
			// Decrypting the token
			jwe, err := jose.ParseEncrypted(token.Value)
			if err == nil {
				// Reading and parsing the json web key json file
				key_data, err := os.ReadFile("private_key.json")
				if err == nil {
					var key jose.JSONWebKey
					err = key.UnmarshalJSON(key_data)
					if err == nil && key.Valid() {
						token_data, err := jwe.Decrypt(key)
						if err == nil {
							var jwt_data JWTData
							if err := json.Unmarshal(token_data, &jwt_data); err != nil {
								log.Println("ERROR: Unable to parse JWT json data:", err)
							} else {
								ctx := context.WithValue(r.Context(), "jwt_data", jwt_data)
								next.ServeHTTP(w, r.WithContext(ctx))
								return
							}
						} else {
							log.Println("WARN: Unable to decrypt the JWE token:", err)
						}
					} else {
						log.Println("ERROR: Invalid private_key.json:", err)
					}
				} else {
					log.Println("ERROR: Unable to read private_key.json:", err)
				}
			} else {
				log.Println("WARN: Error parsing of JWE token:", err)
			}
		}

		// Serve page without token data
		next.ServeHTTP(w, r)
	})
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func handlePage(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" {
		// Serve static files if not index request
		static_fs.ServeHTTP(w, r)
		return
	}

	var jwt_data JWTData

	// Serve index from templates
	ip := filepath.Join("templates", "index.html")
	var dp string

	// In case token_data is set in the context - use the actual document instead of example one
	token_data := r.Context().Value("jwt_data")
	if token_data != nil {
		dp = filepath.Join("templates", "document.html")

		var ok bool
		jwt_data, ok = token_data.(JWTData)
		if !ok {
			log.Println("ERROR: Unable to convert to JWT json data")
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}
	} else {
		dp = filepath.Join("templates", "document_example.html")
		jwt_data.UserName = "Visitor"
	}

	log.Println("INFO: New visit from:", jwt_data.Id, jwt_data.UserName)
	tmpl_funcs := map[string]any{
		"contains": strings.Contains,
	}
	tmpl, err := template.New("index").Funcs(tmpl_funcs).ParseFiles(ip, dp)

	if err != nil {
		log.Println("ERROR: Unable to execute template:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Load the latest saved json with id if it's here
	var doc_body DocumentBody
	dir_path := filepath.Join(save_dir, fmt.Sprintf("%05d", jwt_data.Id))
	if info, err := os.Stat(dir_path); !os.IsNotExist(err) && info.IsDir() {
		// Find the latest file in user id directory
		files, err := ioutil.ReadDir(dir_path)
		if err == nil {
			var mod_time time.Time
			var file_name string
			for _, fi := range files {
				if fi.Mode().IsRegular() {
					if fi.ModTime().After(mod_time) {
						mod_time = fi.ModTime()
						file_name = fi.Name()
					}
				}
			}

			// Reading the found file to document
			if file_name != "" {
				file_path := filepath.Join(dir_path, file_name)
				log.Println("INFO: Loading document data from:", file_path)

				file, err := os.OpenFile(file_path, os.O_RDONLY, 0644)
				if err == nil {
					defer file.Close()
					dec := json.NewDecoder(file)
					if err := dec.Decode(&doc_body); err != nil {
						log.Println("WARN: Unable to parse document body:", file_path, err)
					}
				} else {
					log.Println("ERROR: Unable to open file:", file_path, err)
				}
			}
		} else {
			log.Println("ERROR: Unable to read directory:", dir_path, err)
		}
	}

	// Override the user data from JWT token
	doc_body.UserId = jwt_data.Id
	doc_body.UserName = jwt_data.UserName

	if err := tmpl.ExecuteTemplate(w, "index", doc_body); err != nil {
		log.Println("ERROR: Unable to execute template:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
}

func handleSave(w http.ResponseWriter, r *http.Request) {
	// Save is working only when save_dir is set
	if save_dir == "" {
		http.Error(w, http.StatusText(http.StatusServiceUnavailable), http.StatusServiceUnavailable)
		return
	}

	// Checking the token to find out who is saving the data
	token_data := r.Context().Value("jwt_data")
	if token_data == nil {
		// No user so denying access
		http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}
	jwt_data, ok := token_data.(JWTData)
	if !ok {
		// Bad data
		log.Println("ERROR: Unable to convert token data to bytes")
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Reading json body of the request, max is 1MB
	r.Body = http.MaxBytesReader(w, r.Body, 1048576)

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var doc_body DocumentBody

	if err := dec.Decode(&doc_body); err != nil {
		log.Println("WARN: Unable to parse document body:", err)
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		return
	}

	// Put the token data into the document body effectively overriding it to be sure
	doc_body.UserId = jwt_data.Id
	doc_body.UserName = jwt_data.UserName

	// Create directory to store user saves
	dir_path := filepath.Join(save_dir, fmt.Sprintf("%05d", doc_body.UserId))
	err := os.MkdirAll(dir_path, 0755)
	if err != nil {
		log.Println("ERROR: Unable to create directory", dir_path, err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Save the document body to the save_dir in json format
	out_path := filepath.Join(dir_path, time.Now().Format("060102_150405.json"))
	file, err := os.OpenFile(out_path, os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		log.Println("ERROR: Unable to create file in", out_path, err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	enc := json.NewEncoder(file)
	enc.SetIndent("", " ")

	if err := enc.Encode(&doc_body); err != nil {
		log.Println("ERROR: Unable to encode document to", out_path, err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func main() {
	if len(os.Args) < 3 {
		log.Println("Please run as: ./visit3d <listen_address> <endpoint_url> [save_dir]")
	}

	listen_address = os.Args[1]
	endpoint_url = os.Args[2]

	// Additional options
	if len(os.Args) > 3 {
		// To enable saving of the visitor data administrator need to select writable directory
		tmp_path := os.Args[3]
		if info, err := os.Stat(tmp_path); os.IsNotExist(err) || !info.IsDir() {
			log.Println("ERROR: save_dir path doesn't exist or isn't a directory")
			os.Exit(1)
		}
		if err := os.WriteFile(filepath.Join(tmp_path, "tst.f"), []byte{}, 0644); err != nil {
			log.Println("ERROR: save_dir dir seems not writable:", err)
			os.Exit(1)
		}
		os.Remove(filepath.Join(tmp_path, "tst.f"))

		// Ok, the save_dir looks writable
		save_dir = tmp_path
	}

	static_fs = http.FileServer(http.Dir("./static"))

	mux := http.NewServeMux()
	mux.HandleFunc("/", handlePage)
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/save", handleSave)

	log.Println("INFO: Start listening on", listen_address, "with endpoint:", endpoint_url)
	err := http.ListenAndServe(listen_address, verifyJWT(mux))
	if err != nil {
		log.Println("ERROR: Unable to start listening on", listen_address, err)
		os.Exit(1)
	}
}
