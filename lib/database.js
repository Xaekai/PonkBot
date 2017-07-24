/*!
**|   PonkBot Database
**@
*/

'use strict';

const EventEmitter = require('events');
const Knex = require('knex');

class PonkDatabase extends EventEmitter {
    constructor(config, logger){
        super();

        Object.assign(this, {
            debug   : (process.env.NODE_ENV === 'production' ? false : true),
            client  : config.client,
            version : 0,
            latest  : 2,
            knex    : new Knex(Object.assign({
                client:     config.client,
                connection: config.connection
            }, config.client === 'sqlite3' ? {
                useNullAsDefault: true
            } : {}))
        })

        this.setupLogger(logger);
        this.emit('starting');
        this.createTables();
    }

    setupLogger(logger){
        if(!logger){ throw new Error('Logger not provided') }
        this.logger = {
            log: (...line)=>{
                logger.emit('bot', '[Database]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[Database]', ...line);
            },
            debug: (...line)=>{
                if(this.debug){
                    logger.emit('debug', '[Database]', ...line);
                }
            },
        }
    }

    blackhole(){}

    createTables(){
        this.logger.log('Creating Tables');
        this.knex.schema

            // Users
            .createTableIfNotExists('users', (table)=>{
                table.string('username', 20).primary();
                table.integer('rank');
                table.integer('flags');
                table.integer('last_seen').unsigned();
            })

            // Chat history
            .createTableIfNotExists('chat', (table)=>{
                table.increments();
                table.integer('timestamp').unsigned();
                table.string('user', 20);
                table.text('msg');
                table.string('channel');

                table.foreign('user').references('users.username');
            })

            // Videos
            .createTableIfNotExists('videos', (table)=>{
                table.string('type', 20);
                table.string('id');
                table.string('title');
                table.integer('duration_ms').unsigned();
                table.integer('last_played').unsigned();
                table.integer('flags').unsigned();

                table.primary(['type', 'id']);
            })

            // Playlist statistics
            .createTableIfNotExists('video_stats', (table)=>{
                table.string('type', 20);
                table.string('id');
                table.string('user', 20);
                table.integer('timestamp').unsigned().primary();

                table.foreign(['type', 'id'])
                    .references(['type', 'id'])
                    .on('videos')
                    ;
                table.foreign('user').references('users.username');
            })

            // Channel population tracking
            .createTableIfNotExists('user_count', (table)=>{
                table.integer('timestamp').unsigned();
                table.integer('count').unsigned();
                table.primary(['timestamp', 'count']);
            })

            // Basic key:value storage
            .createTableIfNotExists('simplestore', (table)=>{
                table.string('key', 40).primary();
                table.string('value');
            })

            .then(()=>{
                return this.updateTables(); 
            });
    }

    updateTables(){
        this.logger.log('Updating Tables.');

        this.getKeyValue('dbversion', (version)=>{
            if (!version) {
                this.logger.log('First run. Initializing dbversion.')
                return this.setKeyValue('dbversion', 0, ()=>{this.updateTables()});
            }
            if (parseInt(version) === this.latest) {
                this.logger.log('Tables up to date, database is ready.')
                this.version = this.latest;
                this.emit('ready');
                return;
            }

            this.version = version;

            if (parseInt(version) === 0) {
                this.logger.log('Creating table for moderator auth to web interface.')
                return this.setKeyValue('dbversion', 1, ()=>{
                    this.knex.schema.createTableIfNotExists('webauth', (table)=>{
                        table.increments();
                        table.string('user', 20)
                            .references('username').inTable('users')
                            ;
                        table.string('authkey', 32);
                    })
                    .then(()=>{
                        return this.updateTables();
                    })
                    .catch((err)=>{
                        throw new Error(err);
                    });
                });
            }

            if (parseInt(version) === 1) {
                this.logger.log('Creating table for web interface sessions.')
                return this.setKeyValue('dbversion', 2, ()=>{
                    this.knex.schema.createTableIfNotExists('sessionstore', (table)=>{
                        table.string('sessid').primary();
                        table.json('sess').notNullable();
                        if (['mysql', 'mariasql'].indexOf(this.knex.client.dialect) > -1) {
                            table.dateTime('expired').notNullable().index();
                        } else {
                            table.timestamp('expired').notNullable().index();
                        }
                    })
                    .then(()=>{
                        return this.updateTables();
                    })
                    .catch((err)=>{
                        throw new Error(err);
                    });
                });
            }

        });
    }

}


/*
    Simple Store
*/
Object.assign(PonkDatabase.prototype, {

    getKeyValue: function(key, callback){
        return this.knex('simplestore')
            .where({ key: key })
            .select('value')
            .asCallback((err, row)=>{
                if (row === undefined || !row.length){
                    return callback(null);
                } else {
                    return callback((row.pop())['value']);
                }
            })
            ;
    },

    setKeyValue: function(key, value, callback){
        this.insertKeyValue(key, value, callback)
    },

    insertKeyValue: function(key, value, callback){
        this.knex('simplestore')
            .insert({ key: key, value: value })
            .asCallback((err, row)=>{
                if(err){
                    this.updateKeyValue(key, value, callback);
                } else {
                    if(typeof callback === 'function'){ callback() }
                }
            });
    },

    updateKeyValue: function(key, value, callback){
        this.knex('simplestore')
            .where({ key: key })
            .update({ value: value })
            .asCallback(()=>{
                if(typeof callback === 'function'){ callback() }
            });
    },

});


/*
    Web Interface Moderator Authenication
*/
Object.assign(PonkDatabase.prototype, {
    authGetUserByName: function(user){
        this.logger.debug('authGetUserByName called:', user);

        return new Promise((resolve, reject) => {
            this.knex('webauth')
                .where('user', user)
                .select('id','user','authkey','users.rank')
                .join('users', {'users.username': 'webauth.user'})
                .then((rows)=>{
                    if(!rows.length){
                        return reject(new Error('User not found'));
                    }
                    return resolve(rows.shift());
                },(error)=>{
                    return reject(error);
                });
        });
    },
    authGetUserByID: function(id){
        this.logger.debug('authGetUserByID called:', id);

        return new Promise((resolve, reject) => {
            this.knex('webauth')
                .where('id', id)
                .select('id','user','authkey','users.rank')
                .join('users', {'users.username': 'webauth.user'})
                .then((rows)=>{
                    if(!rows.length){
                        return reject(new Error('User id not found'));
                    }
                    return resolve(rows.shift());
                },(error)=>{
                    return reject(error);
                });
        });
    },
    authSetUserCode: function(user){
        this.logger.debug('authSetUserCode called:', user);

        return new Promise((resolve)=>{
            const newAuth = require('bcrypt-nodejs').hashSync(user + Date.now()).replace(/\.|\/|\\/g,'').slice(-32);
            this.authGetUserByName(user).then((row)=>{
                this.knex('webauth')
                    .where({ user: user })
                    .update({ authkey: newAuth })
                    .catch((error)=>{
                        this.logger.error(JSON.stringify(error));
                    });

                return resolve(newAuth);
            }, (error)=>{
                this.knex('webauth')
                    .insert({ user: user, authkey: newAuth })
                    .catch((error)=>{
                        this.logger.error(JSON.stringify(error));
                    });

                return resolve(newAuth);
            });
        });
    },
});


/*
    Users
*/
Object.assign(PonkDatabase.prototype, {

    userInsert: function(username, rank){
        this.logger.debug('userInsert called:', username, rank);
        let raw = this.knex('users').insert({ username: username, flags: 0, rank: rank }).toString();

        // INSERT IGNORE
        switch(this.client){
            case 'pg'      : raw += ' on conflict do nothing'; break;
            case 'mysql'   : raw = raw.replace(/^insert/i, 'insert ignore'); break;
            case 'sqlite3' : raw = raw.replace(/^insert/i, 'insert or ignore'); break;
        }

        this.knex.raw(raw).catch((error)=>{
            this.logger.debug('insertUser error:', error);
        });
    },


    userGet: function(username){
        return new Promise((resolve, reject)=>{
            this.knex('users')
                .where({ username })
                .then((rows)=>{
                    if(!rows.length){
                        return reject(new Error('User not found'));
                    }

                    return resolve(rows.shift());
                },(error)=>{
                    this.logger.error(JSON.stringify(error));
                    return reject(error);
                });
        });
    },

    userUpdateRank: function(username, rank){
        this.knex('users')
            .where({ username })
            .update({ rank })
            .catch((error)=>{
                this.logger.error(JSON.stringify(error));
             });
    },

    userGetFlags: function(username){
        return new Promise((resolve, reject)=>{
            this.knex('users')
                .where({ username })
                .select('flags')
                .then((rows)=>{
                    if(!rows.length){
                        return resolve(0);
                    }

                    const row = rows.shift();
                    return resolve(row.flags);
                },(error)=>{
                    this.logger.error(JSON.stringify(error));
                    return resolve(0);
                });
        });
    },
    userClearFlags: function(username){
        this.knex('users')
            .where({ username })
            .update({ flags : 0 })
            .catch((error)=>{
                this.logger.error(JSON.stringify(error));
            });
    },
    userSetFlags: function(username, flags){
        this.userGetFlags(username).then((flagsNow)=>{
            this.knex('users')
                .where({ username })
                .update({ flags : flagsNow | flags })
                .catch((error)=>{
                    this.logger.error(JSON.stringify(error));
                });
        });
    },
    userDropFlags: function(username, flags){
        this.userGetFlags(username).then((flagsNow)=>{
            this.knex('users')
                .where({ username })
                .update({ flags : ( flagsNow | flags ) ^ flags })
                .catch((error)=>{
                    this.logger.error(JSON.stringify(error));
                });
        });
    },

    usersGetByFlags: function(flags, fulldata){
        return new Promise((resolve) => {
            const users = [];

            this.knex('users').whereRaw('(?? & ?) == ?', ['flags',flags,flags]).then((rows) => {
                while(rows.length){
                    let row = rows.shift();
                    users.push(fulldata ? row : row.username)
                }
                return resolve(users);
            },(error)=>{
                this.logger.error(JSON.stringify(error));
                return resolve(users);
            });
        });
    },

    usersInsertCount: function(timestamp, count){
        this.knex('user_count')
            .insert({ timestamp, count })
            .catch((error)=>{
                this.logger.error(JSON.stringify(error));
            });
    },

});


// Media
Object.assign(PonkDatabase.prototype, {
    // Determines who first queued a video
    mediaBlame : function({ type, id }, bots) {
        return this.knex('video_stats')
                   .select('user')
                   .whereNotIn('user', [...bots])
                   .andWhere('type', type)
                   .andWhere('id', id)
                   .limit(1);
    },

    // Tracking and metrics are the life blood of politics
    mediaStat : function({ type, id, queueby : user }){
        this.knex('video_stats')
            .insert({ type, id, user, timestamp: Date.now() })
            .then((row)=>{
                this.logger.debug(`Entered ${type}:${id} into media stats.`);
            },(error)=>{
                this.logger.debug(`Encountered error: ${JSON.stringify(error)}`);
            });
    },

    // Video killed the radio star
    mediaGet: function({ many = 1, maxvidlen = 600, flags = 0, types = ['yt','dm','vi'] }){
        // maxvidlen is seconds, duration is stored in ms
        const maxlen = maxvidlen * 1000;

        const SQL = this.knex('videos')
            .select('type', 'id', 'title', 'duration_ms', 'flags')
            .whereIn('type', types)
            .andWhere('flags', flags)
            .andWhere('duration_ms', '<', maxlen)
            .andWhere('last_played', '<>', 0)
            .orderByRaw(`${this.client === 'mysql' ? 'rand' : 'random'}()`)
            .limit(many)
            ;

        return SQL;
    },

    mediaUpdate: function({ type, id, last_played }){
        this.knex('videos').where({ type, id }).update({ last_played }).catch((error)=>{
            this.logger.error(JSON.stringify(error));
        })
    },

    // TODO: MAKE AND USE AN UPSERT WRAPPER
    mediaInsert({ type, id, title, duration }) {
        this.logger.log(`Inserting media into database: ${type}:${id} - ${title}`);

        this.knex.raw((()=>{
            let raw = this.knex('videos').insert({ type, id, title,
                duration_ms: duration * 1000,
                last_played: 0, // Do not use Date.now()
                flags: 0
            }).toString();

            if(this.client == 'pg'){
                raw += ' on conflict do nothing';
            } else {
                raw = raw.replace(/^insert/i, ()=>{
                    if(this.client === 'mysql'){ return 'insert ignore' }
                    if(this.client === 'sqlite3'){ return 'insert or ignore' }
                });
            }

            return raw;
        })()).catch((error)=>{
            this.logger.error(JSON.stringify(error));
        });

    },

    mediaGetFlags: function({ type, id }){
        return new Promise((resolve, reject)=>{
            this.knex('videos')
                .where({ type, id })
                .select('flags')
                .then((rows)=>{
                    if(!rows.length){
                        return resolve(0);
                    }

                    const row = rows.shift();
                    return resolve(row.flags);
                },(error)=>{
                    this.logger.error(JSON.stringify(error));
                    return resolve(0);
                });
        });
    },

    mediaSetFlags: function({ type, id, flags }){
        this.mediaGetFlags({ type, id }).then((flagsNow)=>{
            this.knex('videos')
                .where({ type, id })
                .update({ flags : flagsNow | flags })
                .catch((error)=>{
                    this.logger.error(JSON.stringify(error));
                });
        });
    },

    mediaDropFlags: function({ type, id, flags }){
        this.mediaGetFlags({ type, id }).then((flagsNow)=>{
            this.knex('videos')
                .where({ type, id })
                .update({ flags : ( flagsNow | flags ) ^ flags })
                .catch((error)=>{
                    this.logger.error(JSON.stringify(error));
                });
        });
    },

    mediaClearFlags: function({ type, id, flags }){
        this.knex('videos')
            .where({ type, id })
            .update({ flags : 0 })
            .catch((error)=>{
                this.logger.error(JSON.stringify(error));
            });
    },

    mediaGetCount: function(){
        return new Promise((resolve)=>{
            this.knex('videos').count('* as count').then((rows)=>{
                if(!rows.length){
                    resolve(0);
                }
                const count = rows.shift()['count'];
                resolve(count);
            },(error)=>{
                resolve(0);
                this.logger.error(JSON.stringify(error));
            })
        })
    }

});

module.exports = PonkDatabase;

