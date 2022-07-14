# WebGL site framework

TODO: Better name for the project

## How to run locally

Go to `./www` directory and run the next commands:

1. Generate HTTPS certificate - https is needed for chromium mobile device orientation and WebXR VR
   ```
   www $ echo "\n\n\n\n\n\n\n" | openssl req -new -x509 -keyout localhost2.pem -out localhost2.pem -days 365 -nodes
   ```
2. Run the simple python3 https server
   ```
   www $ python3 -c "import http.server, ssl; server_address = ('0.0.0.0', 4443); httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler); httpd.socket = ssl.wrap_socket(httpd.socket, server_side=True, certfile='localhost.pem', ssl_version=ssl.PROTOCOL_TLS); httpd.serve_forever()"
   ```
3. Now you can visit `https://localhost:4443/` (or `https://<IP>:4443/` from mobile/VR device).
