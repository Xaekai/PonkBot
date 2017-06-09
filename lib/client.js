/*!
**|   CyTube Client
**@
*/

'use strict';

const request = require('request');
const EventEmitter = require('events');

class CyTubeClient extends EventEmitter {
    constructor(server, logger, callback){
        const defaults = {
            host  : 'cytu.be',
            port  : '443',

            chan  : 'test',
            pass  : null,

            user  : `Test-${Math.random().toString(16).slice(-8)}`,
            auth  : null,

            agent : 'CyTube Client 0.2',
            debug : (process.env.NODE_ENV === 'production' ? false : true),

            socketURL : null
        }

        super();
        Object.assign(this, defaults, server);

        if(typeof callback === 'function'){
            this.once('ready', callback.bind(this))
        }

        this.setupLogger(logger);
        this.getSocketURL();
    }

    setupLogger(logger){
        if(!logger){
            this.logger = { log: console.log, error: console.error }
        } else {
            this.logger = {
                log: (...line)=>{
                    logger.emit('bot', '[Client]', ...line)
                },
                error: (...line)=>{
                    logger.emit('err', '[Client]', ...line)
                },
            }
        }
    }

    get configURL() {
        return `https://${this.host}:${this.port}/socketconfig/${this.chan}.json`;
    }

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
                return;
            }

            var data = JSON.parse(body);
            let servers = [...data.servers];
            while(servers.length){
                let server = servers.pop();
                if(server.secure === true && server.ipv6 === undefined){
                    this.socketURL = server.url;
                }
            }
            if(!this.socketURL){
                this.logger.error('No suitable sockets available.')
                this.emit('error', new Error('No socket available'));
                return;
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
                this.logger.error('Login failure: Channel requires password.');
                this.emit('error', new Error('Channel requires password'));
                return;
            }
            this.logger.log('Sending channel password.');
            this.socket.emit('channelPassword', this.pass);
        })

        this.killswitch = setTimeout(()=>{ 
            this.logger.error('Failure to establish connection within 60 seconds.');
            this.emit('error', new Error('Channel connection failure'));
        }, 60 * 1000);

        this.socket.once('login', (data)=>{
            if(typeof data === 'undefined'){
                this.emit('error', new Error('Malformed login frame recieved'));
                return
            }
            if(!data.success){
                this.logger.error('Login failure');
                this.logger.error(JSON.stringify(data));
                this.emit('error', new Error('Channel login failure'));
                return
            }
            if(data.success){
                this.logger.log('Channel connection established.');
                this.emit('started');
                clearTimeout(this.killswitch);
            }
        });

        this.socket.once('rank', ()=>{
            this.socket.emit('login', Object.assign({}, {
                name: this.user
            }, this.auth ? { pw: this.auth } : undefined));
        })

        return this;
    }

    // TODO: consider Cal's suggestion to monkey patch SocketIO
    assignHandlers(){
        this.logger.log('Assigning Handlers');
        [
/*
    These are from CyTube /src/user.js
*/
            'announcement',
            'clearVoteskipVote',
            'disconnect',
            'kick',
            'login',
            'setAFK',

/*
    Current list as of 2017-06-04
    The following command was used to get this list from CyTube /src/channel/

    $> ( spot emit && spot broadcastAll ) \
        | awk {'print $2'} | sed 's/"/\n"/g' \
        | grep '"' | grep -Pi '[a-z]' | sort -u
*/

            'addFilterSuccess',
            'addUser',
            'banlist',
            'banlistRemove',
            'cancelNeedPassword',
            'changeMedia',
            'channelCSSJS',
            'channelNotRegistered',
            'channelOpts',
            'channelRankFail',
            'channelRanks',
            'chatFilters',
            'chatMsg',
            'clearchat',
            'clearFlag',
            'closePoll',
            'cooldown',
            'costanza',
            'delete',
            'deleteChatFilter',
            'drinkCount',
            'emoteList',
            'empty',
            'errorMsg',
            'listPlaylists',
            'loadFail',
            'mediaUpdate',
            'moveVideo',
            'needPassword',
            'newPoll',
            'noflood',
            'playlist',
            'pm',
            'queue',
            'queueFail',
            'queueWarn',
            'rank',
            'readChanLog',
            'removeEmote',
            'renameEmote',
            'searchResults',
            'setCurrent',
            'setFlag',
            'setLeader',
            'setMotd',
            'setPermissions',
            'setPlaylistLocked',
            'setPlaylistMeta',
            'setTemp',
            'setUserMeta',
            'setUserProfile',
            'setUserRank',
            'spamFiltered',
            'updateChatFilter',
            'updateEmote',
            'updatePoll',
            'usercount',
            'userLeave',
            'userlist',
            'validationError',
            'validationPassed',
            'voteskip',
            'warnLargeChandump',
        ].forEach((frame)=>{
            if(this.debug){
                this.socket.on(frame, (...args)=>{ this.emit('DEBUG', frame, ...args) });
            }
            this.socket.on(frame, (...args)=>{
                this.emit(frame, ...args);
            });
        });
    }

}

module.exports = CyTubeClient;
