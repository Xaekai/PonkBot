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
            client  : config.client,
            version : 0,
            latest  : 1,
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
        if(!logger){
            this.logger = { log: console.log, error: console.error }
        } else {
            this.logger = {
                log: (...line)=>{
                    logger.emit('bot', '[Database]', ...line)
                },
                error: (...line)=>{
                    logger.emit('err', '[Database]', ...line)
                },
            }
        }
    }

    blackhole(){}

    createTables(){
        this.logger.log('Creating Tables');
        this.knex.schema

            // Users
            .createTableIfNotExists('users', (table)=>{
                table.string('username', 20).primary();
                table.boolean('blacklisted');
                table.boolean('block');
                table.integer('rank');
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

            if (parseInt(version) === 0) {
                this.logger.log('Creating table for moderator auth to web interface.')
                return this.setKeyValue('dbversion', 1, ()=>{
                    this.knex.schema.createTableIfNotExists("backendauth", (table)=>{
                        table.string('user', 20).primary()
                            .references('username').inTable('users')
                            ;
                        table.string('authkey');
                    })
                    .then(()=>{
                        this.version = 1;
                        return this.updateTables();
                    })
                    .catch(()=>{
                        this.version = 1;
                        return this.updateTables();
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

})

module.exports = PonkDatabase;
