"use strict";
const bignum = require('bignum');
const cnUtil = require('forknote-util');
const cnHashing = require('cryptonight-hashing');
const crypto = require('crypto');
const debug = require('debug')('coinFuncs');

let hexChars = new RegExp("[0-9a-f]+");

function Coin(data){
    this.bestExchange = global.config.payout.bestExchange;
    this.data = data;
    let instanceId = crypto.randomBytes(4);
    this.coinDevAddress = "iz5w5LGYQY2SseEd9BTaF8SRqFmZLTEVDBEGidvzYnZBcc9RMEHXs2rXBZfAvXQPPc85NR2JeZcQUj7jjBcgw26b1Rk6m4H2z";  // Developer Address
    this.poolDevAddress = "iz5imhe9C7vWnjZtZBFtT8MwNxVuJuryUUHXSAtnWUo93CJzNdZBizHQExPRCHUBi36tk2BcigPAFRDA4cnddGXF1R6j69n3w";  // Venthos Address

    this.blockedAddresses = [
        this.coinDevAddress,
        this.poolDevAddress
    ];

    this.exchangeAddresses = [
        "iz4pcDLxmo7KqbFmYjE5aGDv68U9Sgm1ePFjWUY24vzyPeGMcoG894MAFjrtHbaMv1TygTcvJWzGN3zNR6PeEYuc1w8V2tiMW" // stocks.exchange
    ]; // These are addresses that MUST have a paymentID to perform logins with.

    this.prefix = 251;

    this.supportsAutoExchange = false;

    this.niceHashDiff = 400000;

    this.getBlockHeaderByHash = function(blockHash, callback){
        global.support.rpcDaemon('getblockheaderbyhash', {"hash": blockHash}, function (body) {
            if (typeof(body) !== 'undefined' && body.hasOwnProperty('result')){
                return callback(null, body.result.block_header);
            } else {
                console.error(JSON.stringify(body));
                return callback(true, body);
            }
        });
    };

    this.getBlockHeaderByHeight = function(blockHeight, callback){
        // Intense Coin's API is busted.  Using 'getblockheaderbyheight' with the correct block height
        // results in the information for the previous block being provided.  Here, we +1 what was
        // requested of us so we can give back the data actually desired.
        global.support.rpcDaemon('getblockheaderbyheight', {"height": blockHeight + 1}, function (body) {
            if (typeof(body) !== 'undefined' && body.hasOwnProperty('result')){
                return callback(null, body.result.block_header);
            } else {
                console.error(JSON.stringify(body));
                return callback(true, body);
            }
        });
    };

    this.getLastBlockHeader = function(callback){
        global.support.rpcDaemon('getlastblockheader', [], function (body) {
            if (typeof(body) !== 'undefined' && body.hasOwnProperty('result')){
                return callback(null, body.result.block_header);
            } else {
                console.error(JSON.stringify(body));
                return callback(true, body);
            }
        });
    };

    this.getBlockTemplate = function(walletAddress, callback){
        global.support.rpcDaemon('getblocktemplate', {
            reserve_size: 17,
            wallet_address: walletAddress
        }, function(body){
            return callback(body);
        });
    };

    this.submitBlock = function(blockBlobData, callback){
        global.support.rpcDaemon('submitblock', [blockBlobData], function(body){
            if (typeof(body) !== 'undefined' && body.hasOwnProperty('result')){
                return callback(null, body.result.status);
            } else {
                console.error(JSON.stringify(body));
                return callback(true, body);
            }
        });
    };

    this.getBalance = function(callback){
        global.support.rpcWallet('getBalance', {}, function (body) {
            if (typeof(body) !== 'undefined' && body.hasOwnProperty('result')){
                // Intense Coin returns differently named objects than what the pool code expects,
                // so we shoe horn them into a standardized naming scheme so it matches up
                return callback(null, {
                    balance: body.result.lockedAmount,
                    unlocked_balance: body.result.availableBalance
                });
            } else {
                console.error(JSON.stringify(body));
                return callback(true, body);
            }
        });
    };

    this.getHeight = function(callback){
        // Intense Coin does not have a 'getheight' API call.  It seems that we can utilize
        // 'getstatus' for this purpose instead and simply return the value of 'blockCount'.
        global.support.rpcWallet('getStatus', {}, function (body) {
            if (typeof(body) !== 'undefined' && body.hasOwnProperty('result')){
                return callback(null, body.result.blockCount);
            } else {
                console.error(JSON.stringify(body));
                return callback(true, body);
            }
        });
    };

    this.baseDiff = function(){
        return bignum('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16);
    };

    this.validateAddress = function(address){
        // This function should be able to be called from the async library, as we need to BLOCK ever so slightly to verify the address.
        address = new Buffer(address);
        return cnUtil.address_decode(address) === this.prefix;
    };

    this.isIntegratedAddress = function(address) {
        return false;
    };

    this.convertBlob = function(blobBuffer){
        return cnUtil.convert_blob(blobBuffer);
    };

    this.constructNewBlob = function(blockTemplate, NonceBuffer){
        return cnUtil.construct_block_blob(blockTemplate, NonceBuffer);
    };

    this.getBlockID = function(blockBuffer){
        return cnUtil.get_block_id(blockBuffer);
    };

    this.BlockTemplate = function(template) {
        /*
        Generating a block template is a simple thing.  Ask for a boatload of information, and go from there.
        Important things to consider.
        The reserved space is 13 bytes long now in the following format:
        Assuming that the extraNonce starts at byte 130:
        |130-133|134-137|138-141|142-145|
        |minerNonce/extraNonce - 4 bytes|instanceId - 4 bytes|clientPoolNonce - 4 bytes|clientNonce - 4 bytes|
        This is designed to allow a single block template to be used on up to 4 billion poolSlaves (clientPoolNonce)
        Each with 4 billion clients. (clientNonce)
        While being unique to this particular pool thread (instanceId)
        With up to 4 billion clients (minerNonce/extraNonce)
        Overkill?  Sure.  But that's what we do here.  Overkill.
         */

        // Set this.blob equal to the BT blob that we get from upstream.
        this.blob = template.blocktemplate_blob;
        this.idHash = crypto.createHash('md5').update(template.blocktemplate_blob).digest('hex');
        // Set this.diff equal to the known diff for this block.
        this.difficulty = template.difficulty;
        // Set this.height equal to the known height for this block.
        this.height = template.height;
        // Set this.reserveOffset to the byte location of the reserved offset.
        this.reserveOffset = template.reserved_offset;
        // Set this.buffer to the binary decoded version of the BT blob.
        this.buffer = new Buffer(this.blob, 'hex');
        // Copy the Instance ID to the reserve offset + 4 bytes deeper.  Copy in 4 bytes.
        instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3);
        // Generate a clean, shiny new buffer.
        this.previous_hash = new Buffer(32);
        // Copy in bytes 7 through 39 to this.previous_hash from the current BT.
        this.buffer.copy(this.previous_hash, 0, 7, 39);
        // Reset the Nonce. - This is the per-miner/pool nonce
        this.extraNonce = 0;
        // The clientNonceLocation is the location at which the client pools should set the nonces for each of their clients.
        this.clientNonceLocation = this.reserveOffset + 12;
        // The clientPoolLocation is for multi-thread/multi-server pools to handle the nonce for each of their tiers.
        this.clientPoolLocation = this.reserveOffset + 8;
        this.nextBlob = function () {
            // Write a 32 bit integer, big-endian style to the 0 byte of the reserve offset.
            this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
            // Convert the blob into something hashable.
            return global.coinFuncs.convertBlob(this.buffer).toString('hex');
        };
        // Make it so you can get the raw block blob out.
        this.nextBlobWithChildNonce = function () {
            // Write a 32 bit integer, big-endian style to the 0 byte of the reserve offset.
            this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
            // Don't convert the blob to something hashable.  You bad.
            return this.buffer.toString('hex');
        };
    };

    this.cryptoNight = function(convertedBlob) {
        return cnHashing.cryptonight(convertedBlob, 0);
    };

}

module.exports = Coin;
