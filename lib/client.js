/*!
**|   Generic CyTube Client Class
**@
*/

'use strict';

const request = require('request');
const EventEmitter = require('events');

class CyTubeClient extends EventEmitter {
    constructor(server, logger, callback){
        const defaults = {
            agent : 'CyTube Client 0.1a',

            host  : 'cytu.be',
            port  : '443',

            chan  : 'test',
            pass  : null,

            user  : `Test-${Math.random().toString(16).slice(-8)}`,
            auth  : null,
        }

        super();
        Object.assign(this, defaults, server);

        this.logger = {
            log: function(){
                console.log(`[CyTubeClient] ${Array.prototype.join.call(arguments, ' ')}`);
            },
            error: function(){
                console.error(`[CyTubeClient] ${Array.prototype.join.call(arguments, ' ')}`);
            },
        }

        if(typeof callback === 'function'){
            this.once('ready', callback.bind(this))
        }

        this.getSocketURL();
    }

    get configURL() {
        return `https://${this.host}:${this.port}/socketconfig/${this.chan}.json`;
    }

    // https://cytu.be/socketconfig/mlp.json
    // {"servers":[{"url":"https://cytu.be:10443","secure":true},{"url":"http://sea.cytu.be:8880","secure":false}]}
    getSocketURL(){
        this.logger.log('Getting socket config')
        request({
            url: this.configURL,
            headers: {
                'User-Agent': this.agent
            },
            timeout: 20 * 1000
        }, (error, response, body) => {
            if(error){
                this.logger.error(error);
                this.emit('error', new Error('Socket lookup failure'));
            }

            var data = JSON.parse(body);
            let servers = [...data.servers];
            while(servers.length){
                let server = servers.pop();
                if(server.secure === true && server.ipv6 === undefined){
                    this.socketURL = server.url;
                }
            }
            this.logger.log('Socket server url retrieved:', this.socketURL)
            this.emit('ready');
        });
    }

    connect(){
        this.logger.log('Connecting to socket server');
        this.emit('connecting');

        this.socket = require('socket.io-client')(this.socketURL)
            .on('error', (err)=>{
                this.emit('error', new Error(err));
            })
            .once('connect', ()=>{
                this.emit('connected');
                this.assignHandlers();
            })
            ;
        return this;
    }

    start(){
        this.logger.log('Connecting to channel.');
        this.socket.emit('joinChannel', {
            name: this.chan
        })
        this.emit('starting');

        this.socket.once('needPassword', ()=>{
            if(typeof this.pass !== 'string'){
                this.emit('error', new Error('Channel requires password'))
            }
            this.logger.log('Sending channel password.')
            this.socket.emit('channelPassword', this.pass);
        })

        this.socket.once('rank', ()=>{
            this.socket.emit('login', Object.assign({}, {
                name: this.user
            }, this.auth ? { pw: this.auth } : undefined));
        })

        this.killswitch = setTimeout(()=>{ 
            this.logger.error('Failure to establish connection within 60 seconds. Terminating.');
            process.exit(0);
        }, 60 * 1000);

        this.socket.once('login', (data)=>{
            if(data && data.success){
                this.logger.log('Channel connection established.');
                this.emit('started');
                clearTimeout(this.killswitch);
            }
        });

        return this;
    }

    assignHandlers(){
        // TODO: consider Cal's suggestion to monkey patch SocketIO
        // This list is outdated, grep a new one from CyTubes src tree.
        [
            'addUser',
            'banlist',
            'changeMedia',
            'channelOpts',
            'chatMsg',
            'delete',
            'disconnect',
            'emoteList',
            'kick',
            'listPlaylists',
            'login',
            'mediaUpdate',
            'moveVideo',
            'needPassword',
            'playlist',
            'pm',
            'queue',
            'removeEmote',
            'setAFK',
            'setCurrent',
            'setLeader',
            'setMotd',
            'setPermissions',
            'setTemp',
            'setUserRank',
            'updateEmote',
            'usercount',
            'userLeave',
            'userlist',
        ].forEach((frame)=>{
            this.logger.log('Adding Handler:', frame);

            this.socket.on(frame, function(){
                this.emit(frame, ...arguments);
            }.bind(this));
        });
    }

}

module.exports = CyTubeClient;
