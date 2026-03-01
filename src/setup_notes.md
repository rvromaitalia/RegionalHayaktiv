### Check if pem and key certificates match:
## run from the folder on git bash where files are located:
$ openssl x509 -in swish-client.pem -noout -modulus | openssl md5
MD5(stdin)= 22827a9401a8750c276b9fcd54d1b4f9

Roman@pc1 MINGW64 ~/IdeaProjects/RegionalWebsite/swish-backend (dev)
$ openssl rsa -in swish-client.key -noout -modulus | openssl md5
MD5(stdin)= 22827a9401a8750c276b9fcd54d1b4f9

### Check teh crtificate issuer:
openssl x509 -in swish-client.pem -noout -subject -issuer
subject=CN=1234661658, O=8025333496, C=SE
issuer=C=SE, O=Skandinaviska Enskilda Banken AB (publ), serialNumber=ESSESESS, CN=SEB Customer CA1 v2 for Swish


### Setting a  test enviroment

1. Download test cerificates from "https://assets.ctfassets.net/4dca8u8ebqnn/4CgQJUfc6ncjKHooAkqvDx/d27012ce097a5b0f6b151a8ccdfe285d/MSS_test_3.0.zip" to you working dir. Use ex, Swish_TLS_RootCA.pem and Swish_Merchant_TestCertificate_1234679304.p12 only

2. Convert the .p12 into .pem + .key (Git Bash)
cd "/c/Users/Roman/IdeaProjects/RegionalWebsite/swish-backend"

# Export Keys KEY (unencrypted)
$ openssl pkcs12 -in "Swish_Merchant_TestCertificate_1234679304.p12" -nocerts -nodes -out swish-test-client.key
openssl pkcs12 -in "Swish_Merchant_TestCertificate_1234679304.p12" -clcerts -nokeys -out leaf.pem
openssl pkcs12 -in "Swish_Merchant_TestCertificate_1234679304.p12" -cacerts -nokeys -out chain.pem

pass: swish

3. 
INvoke this whne you are having server.js running locally and ngrook port is up. Number of the ports is hwong in your .env file:
nvoke-RestMethod -Method POST `  -Uri http://localhost:3000/api/swish/paymentrequests `  -ContentType "application/json" `  -Body '{ "amount": "2", 
"message": "Prod verification", "reference": "PROD-VERIFY-001" }' 