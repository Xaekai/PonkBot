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
            latest  : 3,
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
                table.integer('flags').unsigned();
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

        this.getKeyValue('dbversion').then((version) => {
            if (typeof version === 'undefined') {
                this.logger.log('First run. Initializing dbversion.')
                return this.setKeyValue('dbversion', 0).then(() => { this.updateTables() });
            }
            if (parseInt(version) === this.latest) {
                this.logger.log('Tables up to date, database is ready.')
                this.version = this.latest;
                this.emit('ready');
                return;
            }

            this.version = parseInt(version);

            let state = 0;
            if (this.version === state) {
                this.logger.log('Creating table for moderator auth to web interface.')
                return this.knex.schema.createTableIfNotExists('webauth', (table) => {
                    table.increments();
                    table.string('user', 20)
                        .references('username').inTable('users')
                        ;
                    table.string('authkey', 32);
                })
                .then(() => {
                    this.setKeyValue('dbversion', ++state).then(() => {
                        this.updateTables();
                    });
                })
                .catch((error) => {
                    throw error;
                });
            }

            state++; // 1
            if (this.version === state) {
                this.logger.log('Creating table for web interface sessions.')
                return this.knex.schema.createTableIfNotExists('sessionstore', (table) => {
                    table.string('sessid').primary();
                    table.json('sess').notNullable();
                    if (['mysql', 'mariasql'].indexOf(this.knex.client.dialect) > -1) {
                        table.dateTime('expired').notNullable().index();
                    } else {
                        table.timestamp('expired').notNullable().index();
                    }
                })
                .then(() => {
                    this.setKeyValue('dbversion', ++state).then(() => {
                        this.updateTables();
                    });
                })
                .catch((error) => {
                    throw error;
                });
            }

            state++; // 2
            if (this.version === state) {
                this.logger.log('Creating table for user profiles and hybrid permissions.')
                return this.knex.schema.createTableIfNotExists('users_meta', (table) => {
                    table.string('user', 20).primary();

                    table.text('avatar');
                    table.text('profile');
                    table.json('hybrid');

                    table.foreign('user').references('users.username');
                })
                .then(()=>{
                    this.setKeyValue('dbversion', ++state).then(()=>{
                        this.updateTables();
                    });
                })
                .catch((error) => {
                    throw error;
                });
            }

        })
        .catch((error) => {
            throw error;
        });
    }

    statistics() {
        return new Promise(fulfill => {
            Promise.all([
                this.mediaGetStats(),
                this.mediaPopular(),
                this.messagesStats(),
                this.usersAverage(),
            ]).then(stats => {
                fulfill({
                    mediaStats   : stats.shift(),
                    mediaPopular : stats.shift(),
                    messageStats : stats.shift(),
                    usersAverage : stats.shift(),
                });
            });
        });
    }

}


/*
    Simple Store
*/
Object.assign(PonkDatabase.prototype, {

    getKeyValue: function(key, callback){
        return new Promise((resolve, reject)=>{
            this.knex('simplestore')
                .where({ key })
                .select('value')
                .then((result)=>{
                    if(result.length){
                        return resolve((result.pop())['value']);
                    }
                    return resolve(undefined);
                },(error)=>{
                    this.logger.error('Unexpected error', '\n', error);
                    return reject(error);
                });
        });
    },

    setKeyValue: function(key, value){
        return this.insertKeyValue(key, value);
    },

    insertKeyValue: function(key, value){
        return new Promise((resolve, reject)=>{
            this.knex('simplestore')
                .insert({ key: key, value: value })
                .then((result)=>{
                    return resolve(result);
                },(error)=>{
                    return resolve(this.updateKeyValue(key, value));
                });
        });
    },

    updateKeyValue: function(key, value){
        return new Promise((resolve, reject)=>{
            this.knex('simplestore')
                .where({ key })
                .update({ value })
                .then((result)=>{
                    return resolve(result);
                },(error)=>{
                    this.logger.error('Unexpected error', '\n', error);
                    return reject(error);
                });
        });
    },

});


/*
    Messages
*/
Object.assign(PonkDatabase.prototype, {

    messageInsert: function({ timestamp, user, msg, channel }){
        this.knex('chat').insert({ timestamp, user, msg, channel })
            .catch(error => {
                this.logger.error('Unexpected error', '\n', error);
            });
    },

    messagesCount: function() {
        return new Promise(resolve => {
            this.knex('chat').count('* as count').then((rows) => {
                if(rows.length){
                    return resolve(rows.pop()['count']);
                }
                resolve(0);
            },(error) => {
                this.logger.error('Unexpected error', '\n', error);
                resolve(0);
            });
        });
    },

    // Messages per user
    messagesStats: function() {
        const stats = [];

        return new Promise((resolve, reject) => {
            this.knex.raw(
                this.knex('chat')
                    .select('user').count('*')
                    .groupBy('user').orderBy('count', 'desc')
                    .toString().replace(/from/i, 'as count from')
            ).then((rows) => {
                while(rows.length){
                    let row = rows.shift();
                    if(row.user === ''){ continue }
                    stats.push([ row.user, row.count ]);
                }
                resolve(stats);
            },(error) => {
                this.logger.error('Unexpected error', '\n', error);
                resolve(stats);
            });
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
                    this.logger.error('Unexpected error', '\n', error);
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
                        this.logger.error('Unexpected error', '\n', error);
                    });

                return resolve(newAuth);
            }, (error)=>{
                this.knex('webauth')
                    .insert({ user: user, authkey: newAuth })
                    .catch((error)=>{
                        this.logger.error('Unexpected error', '\n', error);
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

    // Case-insensive user search. Does a full table scan, so use sparingly
    userExists: function(username){
        return new Promise((resolve, reject) => {
            this.knex('users')
                .select('username as name', 'rank')
                .where(this.knex.raw('LOWER(:column:) = :name', {
                    column: 'users.username',
                    name: username.toLowerCase()
                })).then((result) => {
                    if(result.length){
                        return resolve(result.pop());
                    }
                    reject(false);
                },(error) => {
                    this.logger.error('Unexpected error', '\n', error);
                    reject(error);
                });
        });
    },

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
                    this.logger.error('Unexpected error', '\n', error);
                    return reject(error);
                });
        });
    },

    userGetRank: function(username){
        return new Promise((resolve, reject) => {
            this.userGet(username)
                .then(user => resolve(user.rank))
                .catch(error => reject(error));
        });
    },

    userUpdateRank: function(username, rank){
        this.knex('users')
            .where({ username })
            .update({ rank })
            .catch((error)=>{
                this.logger.error('Unexpected error', '\n', error);
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
                    this.logger.error('Unexpected error', '\n', error);
                    return resolve(0);
                });
        });
    },
    userClearFlags: function(username){
        this.knex('users')
            .where({ username })
            .update({ flags : 0 })
            .catch((error)=>{
                this.logger.error('Unexpected error', '\n', error);
            });
    },
    userSetFlags: function(username, flags){
        this.userGetFlags(username).then((flagsNow)=>{
            this.knex('users')
                .where({ username })
                .update({ flags : flagsNow | flags })
                .catch((error)=>{
                    this.logger.error('Unexpected error', '\n', error);
                });
        });
    },
    userDropFlags: function(username, flags){
        this.userGetFlags(username).then((flagsNow)=>{
            this.knex('users')
                .where({ username })
                .update({ flags : ( flagsNow | flags ) ^ flags })
                .catch((error)=>{
                    this.logger.error('Unexpected error', '\n', error);
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
                resolve(users);
            },(error)=>{
                this.logger.error('Unexpected error', '\n', error);
                resolve(users);
            });
        });
    },

    usersInsertCount: function(timestamp, count){
        this.knex('user_count')
            .insert({ timestamp, count })
            .catch((error)=>{
                this.logger.error('Unexpected error', '\n', error);
            });
    },

/*
**  Basically this is just rounding down to the nearest hour.
**
**  Function A is converting a date object back into a UNIXTIME 
**  Function B is converting a UNIXTIME into a date object, dropping the minutes.
**  The division and multiplication by 1000 is for JavaScript's Unix time which includes ms
**
**  aaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb a
**  STRFTIME('%s', STRFTIME('%Y-%m-%dT%H:00', timestamp/1000, 'UNIXEPOCH') ) * 1000 
**
**  MySQL's  UNIX_TIMESTAMP   DATE_FORMAT  functions may be useful
**
**  DATE_FORMAT(the_date, '%Y-%m-%d %H:00:00') returns the date truncated down to the nearest hour
**  FROM_UNIXTIME can take the same format string, so we can just use that directly.
**
**  SELECT UNIX_TIMESTAMP( FROM_UNIXTIME( 1425405562278 / 1000 , '%Y-%m-%d %H:00:00' )) * 1000 ;
**  SELECT STRFTIME( '%s', STRFTIME( '%Y-%m-%dT%H:00', 1425405562278 / 1000, 'UNIXEPOCH' )) * 1000 ;
**
*/
    usersAverage: function(callback) {
        let sql = ''; const stats = [];

        if( this.client === 'mysql' ){
            sql += 'SELECT';
            sql += ` UNIX_TIMESTAMP( FROM_UNIXTIME( timestamp / 1000 , '%Y-%m-%d %H:00:00' )) * 1000 AS timestamp,`;
            sql += ' CAST(ROUND(AVG(count)) AS INTEGER) AS count';
            sql += ' FROM user_count';
            sql += ` GROUP BY FROM_UNIXTIME( timestamp / 1000 , '%Y%m%d%H' )`;
        } else if( this.client === 'sqlite3' ){
            sql += 'SELECT';
            sql += ` STRFTIME('%s', STRFTIME('%Y-%m-%dT%H:00', timestamp / 1000, 'UNIXEPOCH')) * 1000 AS timestamp,`;
            sql += ' CAST(ROUND(AVG(count)) AS INTEGER) AS count';
            sql += ' FROM user_count';
            sql += ` GROUP BY STRFTIME('%Y%m%d%H', timestamp / 1000, 'UNIXEPOCH') `;
        } else {
            return Promise.resolve(stats);
        }

        return new Promise(resolve => {
            this.knex.raw(sql).then((rows) => {
                while(rows.length){
                    let row = rows.shift();
                    stats.push([ row.timestamp, row.count ]);
                }
                resolve(stats)
            },(error) => {
                this.logger.error('Unexpected error', '\n', error);
                resolve([]);
            });
        });
    },

});


/*
    Users Meta
*/
Object.assign(PonkDatabase.prototype, {

    userGetProfile: function(user){
        return new Promise((resolve)=>{
            this.knex('users_meta')
                .where({ user })
                .select('avatar', 'profile')
                .then((result)=>{
                    if(result.length){
                        console.log('success', result);
                        resolve(result.pop())
                    }
                    resolve({ avatar: '', profile: '' });
                },(error)=>{
                    this.logger.error('Unexpected error', '\n', error);
                    resolve({ avatar: '', profile: '' });
                });
        });
    },

    userGetHybrid: function(user){
        return new Promise((resolve) => {
            this.knex('users_meta')
                .where({ user })
                .select('hybrid')
                .then((result) => {
                    if(result.length){
                        const hybrid = JSON.parse(result.pop()['hybrid']);
                        resolve(hybrid);
                    }
                    resolve([]);
                },(error) => {
                    this.logger.error('Unexpected error', '\n', error);
                    throw error;
                });
        });
    },

    userUpdateProfile: function(user, { image: avatar, text: profile }){
        return new Promise((resolve, reject) => {
            this.userCreateMeta(user, { avatar, profile }).then((result)=>{
                resolve(result);
            },(error) => {
                this.knex('users_meta')
                    .where({ user })
                    .update({ avatar, profile })
                    .then((result) => {
                        resolve(result);
                    },(error) => {
                        this.logger.error('Unexpected error', '\n', error);
                        throw error;
                    });
            });
        });
    },

    // We don't really have to worry about the row not existing yet here
    userUpdateHybrid: function(user, hybrid){
        return new Promise((resolve, reject) => {
            this.knex('users_meta')
                .where({ user })
                .update({ hybrid: JSON.stringify(hybrid) })
                .then((result) => {
                    resolve(result);
                },(error) => {
                    this.logger.error('Unexpected error', '\n', error);
                    throw error;
                });
        });
    },

    userCreateMeta: function(user, { avatar = '', profile = '', hybrid = [] }){
        return new Promise((resolve, reject) => {
            this.knex('users_meta')
                .insert({ user, avatar, profile, hybrid: JSON.stringify(hybrid) })
                .then((result) => {
                    resolve(result);
                },(error) => {
                    reject(error);
                });
        });
    },

});


/*
    Media
*/
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
            this.logger.error('Unexpected error', '\n', error);
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
            this.logger.error('Unexpected error', '\n', error);
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
                    this.logger.error('Unexpected error', '\n', error);
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
                    this.logger.error('Unexpected error', '\n', error);
                });
        });
    },

    mediaDropFlags: function({ type, id, flags }){
        this.mediaGetFlags({ type, id }).then((flagsNow)=>{
            this.knex('videos')
                .where({ type, id })
                .update({ flags : ( flagsNow | flags ) ^ flags })
                .catch((error)=>{
                    this.logger.error('Unexpected error', '\n', error);
                });
        });
    },

    mediaClearFlags: function({ type, id, flags }){
        this.knex('videos')
            .where({ type, id })
            .update({ flags : 0 })
            .catch((error)=>{
                this.logger.error('Unexpected error', '\n', error);
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
                this.logger.error('Unexpected error', '\n', error);
            })
        })
    },

    // Get video count per user
    mediaGetStats: function() {
        return new Promise(resolve => {
            const stats = []; let sql = '';

            sql += ' SELECT user, count(*) AS count '
            sql += '   FROM video_stats stats, videos vids '
            sql += '  WHERE stats.type = vids.type AND stats.id = vids.id AND NOT vids.flags & 2 '
            sql += '  GROUP BY user '
            sql += '  ORDER BY count(*) DESC '

            this.knex.raw(sql).then((rows) => {
                while(rows.length){
                    let row = rows.shift();
                    if(row.user === ''){ continue }
                    stats.push([ row.user, row.count ]);
                }
                resolve(stats);
            },(error) => {
                this.logger.error('Unexpected error', '\n', error);
                resolve(stats)
            });
        });
    },

    mediaPopular: function() {
        let sql = ''; const stats = [];

        if( this.client === 'mysql' ){
            // TODO
            return Promise.resolve(stats);
        } else if( this.client === 'sqlite3' ){
            sql += ' SELECT videos.type, videos.id, videos.title, videos.flags, count(*) AS count ';
            sql += '   FROM videos, video_stats ';
            sql += '  WHERE video_stats.type = videos.type AND video_stats.id = videos.id AND NOT videos.flags & 2 ';
            sql += '  GROUP BY videos.type, videos.id ';
            sql += '  ORDER BY count(*) DESC ';
            sql += '  LIMIT 10 ';
        } else {
            // Unsupported DB
            return Promise.resolve(stats);
        }

        return new Promise((resolve, reject) => {
            this.knex.raw(sql).then(rows => {
                while(rows.length){
                    let row = rows.shift();
                    stats.push([ row.type, row.id, row.title, row.flags, row.count ]);
                }
                resolve(stats)
            },(error) => {
                this.logger.error('Unexpected error', '\n', error);
                resolve(stats)
            });
        });
    },

});

module.exports = PonkDatabase;

