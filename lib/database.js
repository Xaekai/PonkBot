/*!
**|   PonkBot Database
**@
*/

'use strict';

const Knex = require('knex');

class PonkDatabase {
    constructor(bot, config, logger){
        this.bot = bot;

        this.knex = new Knex({
            client:     databaseConfig.client,
            connection: databaseConfig.connection
        })

        this.version = 0;
        this.latest = 0;
        this.createTables();
    }

    createTables(){
        this.knex.schema

            // Users
            .createTableIfNotExists('users', (table)=>{
                table.string('username').primary();
                table.boolean('blacklisted');
                table.boolean('block');
                table.integer('rank');
                table.integer('last_seen').unsigned();
            })

            // Chat history
            .createTableIfNotExists('chat', (table)=>{
                table.increments();
                table.integer('timestamp').unsigned();
                table.string('user');
                table.string('msg');
                table.string('channel');

                table.foreign('user').references('users.username');
            })

            // Videos
            .createTableIfNotExists('videos', (table)=>{
                table.string('type');
                table.string('id');
                table.string('title');
                table.integer('duration_ms').unsigned();
                table.integer('last_played').unsigned();
                table.integer('flags').unsigned();

                table.primary(['type', 'id']);
            })

            // Playlist statistics
            .createTableIfNotExists('video_stats', (table)=>{
                table.string('type');
                table.string('id');
                table.string('user');
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
                table.string('key').primary();
                table.string('value');
            })

            .then(()=>{ 
                return this.updateTables(); 
            });
    }
}

module.exports = PonkDatabase;
