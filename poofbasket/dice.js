/*!
**|   Dice Parser by Zirak
**|   Shamelessly transformed into a Node module class by Xaekai
**@
*/

class DiceParser {
    constructor(maxRolls){
        Object.assign(this, {
            maxRolls,

            // not exactly stacks, but meh
            rolls         : null,
            numberStack   : null,
            operatorStack : null,

            // the source string and some metadata
            source    : null,
            pos       : 0,
            len       : 0,
            lookahead : '',

            // we don't care about whitespace. well, most whitespace
            whitespace : {
                ' ' : true,
                '\t' : true
            },

            // the operators we deal with
            operators : {
                '+' : {
                    precedence : 1,
                    exec : ( a, b ) => { return a + b }
                },
                '-' : {
                    precedence : 1,
                    exec : ( a, b ) => { return a - b }
                },
                '*' : {
                    precedence : 2,
                    exec : ( a, b ) => { return a * b }
                },
                '/' : {
                    precedence : 2,
                    exec : ( a, b ) => {
                        if ( b === 0 ) {
                            throw new Error( 'Division by 0' );
                        }
                        return a / b;
                    }
                },
                'd' : {
                    precedence : 3,
                    exec : ( rolls, sides, rollsSoFar ) => {
                        if ( rolls > this.maxRolls ) {
                            throw new Error( `Maximum roll count is ${this.maxRolls}` );
                        }

                        var ret = 0, roll;
                        while ( rolls-- ) {
                            roll = Math.floor( Math.random() * sides ) + 1;

                            ret += roll;
                            rollsSoFar.push( roll );
                        }

                        return ret;
                    }
                }
            }
        })
    }

    // infix operator-precedence parser, also supports a d operator - a dice roll
    parse( source ) {
        this.source = source;
        this.pos = 0;
        this.len = source.length;

        this.numberStack = [];
        this.operatorStack = [];
        this.rolls = [];

        this.tokenize();
        this.execute();

        // garbage collection, important for gianormo strings
        this.source = source = null;

        return {
            // the remaining number on the "stack" is the result
            total : this.numberStack[ 0 ],
            // we execute right->left, so the rolls array will be "backwards"
            rolls : this.rolls.reverse()
        };
    }

    // take the source string, and break it down into tokens
    tokenize() {
        var token, last;

        for ( ; this.pos < this.len; this.pos++ ) {
            this.lookahead = this.source[ this.pos ];

            if ( this.whitespace.hasOwnProperty(this.lookahead) ) {
                continue;
            }

            token = this.nextToken();

            if ( token.type === 'number' ) {
                this.numberStack.push( token.value );
            }

            else if ( token.type === 'operator' ) {
                last = this.operatorStack[ this.operatorStack.length - 1 ];

                // check for things like 1d2d3, which aren't valid
                if ( last && token.value === 'd' && last.value === 'd' ) {
                    var itOnTheGround = new Error(
                        'Unexpected unchainable operator d'
                    );
                    itOnTheGround.column = this.pos;

                    throw itOnTheGround; // I'M AN ADULT!
                }

                this.operatorStack.push( token );
            }
        }

    }

    execute() {
        var idx;

        while ( (idx = this.operatorStack.length) ) {
            // execute, BACKWARDS! OH THE INSANITY
            while ( 0 <=-- idx ) {
                execute.call( this, this.operatorStack[idx], idx );
            }
        }

        function execute ( token, index ) {
            var last = this.operatorStack[ index + 1 ];

            // last one is more important than we are
            if ( last && last.precedence > token.precedence ) {
                // execute it
                this.operate( index + 1 );
            }
            // we're about to finish and the last one isn't as all-mighty as we
            //  thought
            else if ( !index ) {
                // execute za operator!
                this.operate( index );
            }
        }
    }

    // fetch le token!
    nextToken() {
        var ch  = this.lookahead;
        var ret = {
            type : null,
            value : ch
        },
        res;

        // have we overflowed, while looking for something else?
        if ( this.pos >= this.len ) {
            throw new Error( 'Unexpected end of input' );
        }

        // is it a digit?
        else if ( ch >= 0 && ch < 10 ) {
            ret.type = 'number';
            res = this.fetchNumber();

            this.pos += res.length - 1;
            ret.value = res.value;
        }

        // is it an operator?
        else if ( this.operators.hasOwnProperty(ch) ) {
            ret.type = 'operator';
            ret.precedence = this.operators[ ch ].precedence;
        }

        // Y U TROLLZ!?!?
        else {
            var chuckNorris = new Error( 'Invalid character ' + ch );
            chuckNorris.column = this.pos;

            throw chuckNorris;
        }


        return ret;
    }

    operate( index ) {
        // grab the two numbers we care about
        // since the source string looks like: 2 + 1
        //  and the index param is actually the index of the operator to use,
        //  we grab the index-th number and the index-th+1 number
        // in the above example, index = 0, we grab numberStack[0] and
        //  numberStack[1]
        var couplet = this.numberStack.slice( index, index + 2 );
        // in addition to the numbers we operate on, there's also a dice-roll
        //  operator, so we take it into consideration
        couplet.push( this.rolls );

        // arr.splice removes items and returns the removed items as an array
        // we remove the index-th item from the operatorStack and grab its
        //  "value", which is the operator symbol (+, * etc)
        // when we have that value, we grab the corresponding operator object
        var op = this.operators[ this.operatorStack.splice(index, 1)[0].value ];

        // arr.splice, as well as removing items, can also add items
        // so, we slice-n-dice at the two numbers, grab the result of executing
        //  the operator, and add that result where we finished slicing
        // for example:
        //  [0, 1, 2].splice( 0, 2, 42 )
        // will make the array look like
        //  [42, 2]
        this.numberStack.splice( index, 2, op.exec.apply(null, couplet) );
    }

    fetchNumber() {
        var offset = 0, num = '', ch;

        // keep eating digits until we find a non-digit
        while ( (ch = this.source[this.pos+offset]) >= 0 && ch < 10 ) {
            num += ch;
            offset++;
        }

        if ( num.length === 0 ) {
            throw new Error(
                'Incomplete operation: Expected number at ' + this.pos
            );
        }

        return {
            value : Number( num ),
            length : offset
        };
    }

}

module.exports = DiceParser;
