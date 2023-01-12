package main

import (
	"context"
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-jose/go-jose/v3"
)

type JWTData struct {
	Id       int
	UserName string
}

var (
	listen_address string // Where to listen on, could be ":8888" or with host or ip "localhost:8888"
	endpoint_url   string // What is the frontend url to redirect the user to, like "https://site.com/"

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
							ctx := context.WithValue(r.Context(), "token_data", token_data)
							next.ServeHTTP(w, r.WithContext(ctx))
							return
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
	token_data := r.Context().Value("token_data")
	if token_data != nil {
		dp = filepath.Join("templates", "document.html")

		value, ok := token_data.([]byte)
		if ok {
			if err := json.Unmarshal(value, &jwt_data); err != nil {
				log.Println("WARN: Unable to parse JWT json data:", err)
			}
		}
	} else {
		dp = filepath.Join("templates", "document_example.html")
		jwt_data.UserName = "Visitor"
	}

	log.Println("INFO: New visit from:", jwt_data.Id, jwt_data.UserName)
	tmpl, err := template.ParseFiles(ip, dp)
	if err != nil {
		log.Println("ERROR: Unable to execute template:", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Error happened on server side"))
		return
	}
	if err := tmpl.ExecuteTemplate(w, "index", jwt_data); err != nil {
		log.Println("ERROR: Unable to execute template:", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Error happened on server side"))
	}
}

func main() {
	if len(os.Args) < 3 {
		log.Println("Please run as: ./visit3d <listen_address> <endpoint_url>")
	}
	listen_address = os.Args[1]
	endpoint_url = os.Args[2]
	static_fs = http.FileServer(http.Dir("./static"))

	mux := http.NewServeMux()
	mux.HandleFunc("/", handlePage)
	mux.HandleFunc("/status", handleStatus)

	log.Println("INFO: Starting listening on", listen_address, "with endpoint:", endpoint_url)
	err := http.ListenAndServe(listen_address, verifyJWT(mux))
	if err != nil {
		log.Println("ERROR: Unable to start listening on", listen_address, err)
	}
}
