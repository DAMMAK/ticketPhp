var jwt = require('jsonwebtoken');
var fs = require('fs');
var algo='RS256';
var tokenData;
var payload={
    nbf:Math.floor(Date.now() / 1000),
        exp:Math.floor(Date.now() / 1000) + 300,
        sub:'gUgTBlRtV9OQN4N92YwhybDHxDnXAKpS',
        iss:'me',
        aud:'https://auth-sandbox.abnamro.com/oauth/token'
};

// sign with RSA SHA256
 var cert = fs.readFileSync('./private_rsa.pem');  // get private key
 jwt.sign(payload, cert, { algorithm: algo},function(error,token){
 console.log(token);
tokenData=token;
 });

module.exports=tokenData;
