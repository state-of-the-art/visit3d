#!/usr/bin/env python3

import sys
from jwcrypto import jwk, jwt
from jwcrypto.common import json_encode, json_decode

key = None

# Try to open key file or generate the new one
try:
    with open('private_key.json', 'r') as f:
        key = jwk.JWK.from_json(f.read())
except FileNotFoundError:
    key = jwk.JWK.generate(kty='EC', crv='P-256')
    with open('private_key.json', 'w') as f:
        f.write(key.export_private())

public_key = jwk.JWK()
public_key.import_key(**json_decode(key.export_public()))

# Making payload dict
payload = dict()
for var in sys.argv[1:]:
    (key, value) = var.split('=', 1)
    # Check if the value is integer
    if value.isdigit() or (value[0] == '-' and value[1:].isdigit()):
        value = int(value)
    payload[key] = value

# Generating encrypted token
header = {
    "alg": "ECDH-ES+A256KW",
    "enc": "A256CBC-HS512",
}
token = jwt.JWT(claims=payload, header=header)
token.make_encrypted_token(public_key)
enc = token.serialize()

print(enc)

#with open('private.key', 'ro') as f:
#    encoded_jwt = jwt.encode({"some": "payload"}, f.readall(), algorithm="RS256")
#print(encoded_jwt)
