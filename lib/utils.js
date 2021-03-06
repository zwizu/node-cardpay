'use strict';

var config = require('./config'),
    crypto = require('crypto'),
    https = require('https'),
    path = require('path'),
    fs = require('fs');

// exports because of tests
exports.ECDSA_KEYS_URL = 'https://moja.tatrabanka.sk/e-commerce/ecdsa_keys.txt';
exports.ECDSA_KEYS_FILE = path.resolve( __dirname, '../ecdsa_keys.txt');


/**
 * Encrypt plainText with secretKey and selected cipher.
 *
 * @param {string} plainText Plain text to encrypt.
 * @param {string} secretKey Secret key in hex or utf8.
 * @param {string} cipher HMAC, AES256 or DES.
 * @returns {string} Ciper string.
 */
exports.encrypt = function(plainText, secretKey, cipher){

    var cipherString = '';
    cipher = cipher || config.defaultOptions.cipher;

    if(cipher === 'DES'){

        var sha1 = crypto.createHash('sha1');
        // fist 8 bytes
        var bPlainText = sha1.update(plainText).digest('binary').slice(0, 8).toString('binary');
        var des = crypto.createCipheriv('DES-ECB', secretKey, '');
        cipherString = des.update(bPlainText, 'binary', 'hex') + des.final('hex');
        cipherString = cipherString.substring(0, 16).toUpperCase();

    } else if(cipher === 'AES256') {

        // accept hexa secure keys
        var buffKeyEncode = 'utf8';
        if(secretKey.length == 64){
            buffKeyEncode = 'hex';
        }

        var sha1 = crypto.createHash('sha1');
        // fist 16 bytes
        var bPlainText = sha1.update(plainText).digest('binary').slice(0, 16).toString('binary');
        var buffKey = new Buffer(secretKey, buffKeyEncode);

        var aes = crypto.createCipheriv('AES-256-ECB', buffKey, '');
        cipherString  = aes.update(bPlainText, 'binary', 'hex') + aes.final('hex');
        cipherString = cipherString.substring(0, 32).toUpperCase();

    } else { // HMAC

        // accept hexa secure keys
        var buffKeyEncode = 'utf8';
        if(secretKey.length == 128){
            buffKeyEncode = 'hex';
        }

        var buffKey = new Buffer(secretKey, buffKeyEncode);
        cipherString = crypto.createHmac('SHA256', buffKey).update(plainText).digest('hex');

    }

    return cipherString;
};


/**
 * Validate ECDSA signature with signature end ecdsaString.
 *
 * @param {string} publicKey Public key from bank portal.
 * @param {string} signature Signature from response parameters.
 * @param {string} ecdsaString ECDSA String assembling from response params.
 */
exports.validateECDSA = function(publicKey, signature, ecdsaString) {

    var verify = crypto.createVerify('sha256');
    var buffSignature = new Buffer(signature, 'hex');
    var buffData = new Buffer(ecdsaString, 'utf8');

    verify.update(buffData);
    return verify.verify(publicKey, buffSignature.toString('binary'), 'binary');
};


/**
 * Get public key from bank portal by key ID.
 *
 * @param {number} keyId
 * @param cb(err, publicKey)
 */
exports.getPublicKey = function(keyId, cb) {

    getPublicKeyFromFile(keyId, function(err, key){
        if(err){
            return cb(err);
        }
        if(key){
            return cb(null, key);
        }
        downloadPublicKeys(function(err){
            if(err){
                return cb(err);
            }
            getPublicKeyFromFile(keyId, cb);
        });

    });
};

/**
 * Download public keys txt file from bank portal.
 */
function downloadPublicKeys(cb){
    var file = fs.createWriteStream(exports.ECDSA_KEYS_FILE);

    file.on('finish', function(){
        file.close(cb);
    });

    https.get(exports.ECDSA_KEYS_URL, function(response){
        response.pipe(file);
    }).on('error', function(err){ // Handle errors
        fs.unlink(exports.ECDSA_KEYS_FILE);
        cb(err);
    });
}

/**
 * Parse txt file with public keys and return key with id {keyId}
 */
function getPublicKeyFromFile(keyId, cb) {

    fs.readFile(exports.ECDSA_KEYS_FILE, 'utf8', function (err, data) {
        if (err) {
            if('ENOENT' === err.code){
                return cb(null, null);
            }
            return cb(err);
        }

        var keyPosition = data.indexOf('KEY_ID: ' + keyId);
        if(keyPosition >= 0){
            data = data.substr(keyPosition).trim();

            var startKeyStr = '-----BEGIN PUBLIC KEY-----';
            var endKeyStr = '-----END PUBLIC KEY-----';
            var startKey = data.indexOf(startKeyStr);
            var endKey = data.indexOf(endKeyStr);
            endKey += endKeyStr.length;
            var publicKey = data.substr(startKey, endKey - startKey).trim();

            return cb(null, publicKey);
        }else{
            return cb(null, null);
        }
    });
}