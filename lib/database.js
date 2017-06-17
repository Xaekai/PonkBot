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
                table.boolean('blacklisted');
                table.boolean('block');
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
                table.integer('timestamp').unsigned();

                table.primary(['type', 'id']);
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
    Users
*/
Object.assign(PonkDatabase.prototype, {
    userInsert: function(username, rank){
        this.logger.debug('insertUser called:', username, rank);
        let raw = this.knex('users').insert({ username: username, blacklisted: 0, block: 0, rank: rank }).toString();

        // INSERT IGNORE
        switch(this.client){
            case 'pg'      : raw += ' on conflict do nothing'; break;
            case 'mysql'   : raw = raw.replace(/^insert/i, 'insert ignore'); break;
            case 'sqlite3' : raw = raw.replace(/^insert/i, 'insert or ignore'); break;
        }

        this.knex.raw(raw).asCallback((err, row)=>{
            this.logger.debug('insertUser return:', err, row);
        });
    },
});


/*
    Web Interface Moderator Authenication
*/
Object.assign(PonkDatabase.prototype, {
    getUserAuth: function(user, callback){
        this.logger.debug('getUserAuth called:', user);
        this.knex('webauth')
            .where('user', user)
            .select('id','user','authkey','users.rank')
            .join('users', {'users.username': 'webauth.user'})
            .asCallback((err, row)=>{
                if (err) {
                    return callback(err, null);
                }
                if (row && row.length) {
                    return callback(null, row.pop());
                }
                return callback(null, row);
            });
    },
    getUserById: function(id, callback){
        this.logger.debug('getUserById called:', id);
        this.knex('webauth')
            .where('id', id)
            .select('id','user','authkey','users.rank')
            .join('users', {'users.username': 'webauth.user'})
            .asCallback((err, row)=>{
                this.logger.debug('getUserById returned', err, row);
                if (err) {
                    return callback(err, null);
                }
                if (row && row.length) {
                    return callback(null, row.pop());
                }
                return callback(null, undefined);
            });
    },
    setUserAuth: function(user, callback){
        this.logger.debug('setUserAuth called:', user);
        var newAuth = require('bcrypt-nodejs').hashSync(user + Date.now()).slice(-32);

        this.getUserAuth(user, (err, row)=>{
            if(!row.user){
                this.knex('webauth').insert({ user: user, authkey: newAuth })
                    .asCallback((err,row)=>true)
            } else {
                this.knex('webauth').where({ user: user }).update({ authkey: newAuth })
                    .asCallback((err,row)=>true)
            }

            return callback(newAuth);
        })
    },
});


module.exports = PonkDatabase;
