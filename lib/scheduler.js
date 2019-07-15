/*!
**|   PonkBot Scheduler
**@
*/

'use strict';

const EventEmitter = require('events');

const Agenda = require('agenda');
const ObjectID = require('mongodb').ObjectID;

class Scheduler extends EventEmitter {
    constructor(config, logger, bot){
        super();
        Object.assign(this, { bot,
            enabled : true,
            active  : false,
            debug   : (process.env.NODE_ENV === 'production' ? false : true),
        });

        this.setupLogger(logger);
        this.setupAgenda(config);

        this.defineJobs(this.agenda);

        this.agenda.on('ready', () => {
            this.agenda.start();
            process.nextTick(() => {
                this.logger.log('Scheduler is now active.');
                this.active = true;
            });
        });
    }

    setupLogger(logger){
        if(!logger){ throw new Error('Logger not provided') }
        this.logger = {
            log: (...line)=>{
                logger.emit('bot', '[Schedule]', ...line);
            },
            error: (...line)=>{
                logger.emit('err', '[Schedule]', ...line);
            },
            debug: (...line)=>{
                if(this.debug){
                    logger.emit('debug', '[Schedule]', ...line);
                }
            },
        }
    }

    setupAgenda(db){
        this.logger.log('Creating Agenda instance.');
        this.agenda = new Agenda({ db });
    }

    getJobs(){
        return new Promise((resolve, reject) => {
            this.agenda.jobs({}, (error, jobs)=>{
                if(error){ return reject(error) }
                resolve(jobs);
            });
        });
    }

    createJob({ when, type, info, recur }, done){
        if(!recur){
            this.agenda.schedule(when, type, info, done);
        } else {
            this.agenda.every(when, type, info, done);
        }
    }

    removeJob(jobID) {
        return new Promise((resolve, reject) => {
            this.agenda.jobs({ _id: new ObjectID(jobID) }, (error, jobs) => {
                if(error){ return reject(error) }

                const job = jobs.pop();
                return job.remove((error)=>{
                    if(error){ return reject(error) }

                    this.logger.log(`Removed JobID ${job._id}.`);
                    resolve(job);
                });
            });
        });
    }

    // Define what sort of scheduling tasks we can perform
    defineJobs(agenda) {
        this.logger.debug('Defining Job Descriptions');

        agenda.define('schedulerQueue', (job) => {
            const { type, id } = job.attrs.data;

            this.emit('queueMedia', { type, id });
        });

        agenda.define('schedulerEpisode', (job) => {
            const { showcode, episode } = job.attrs.data;

            this.emit('queueEpisode', { showcode, episode });
        });

        agenda.define('schedulerMovie', (job) => {
            const { movieid } = job.attrs.data;

            this.emit('queueMovie', { movieid });
        });
    }

}

module.exports = Scheduler;

