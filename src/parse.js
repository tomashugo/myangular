'use strict';

var _ = require('lodash');

var ESCAPES = {
  'n': '\n',
  'f': '\f',
  'r': '\r',
  't': '\t',
  'v': '\v',
  '\'': '\'',
  '"': '"',
};

function parse(expr) {
  var lexer = new Lexer();
  var parser = new Parser(lexer);
  return parser.parse(expr);
}

function Lexer() { }

Lexer.prototype.is = function (chs) {
  return chs.indexOf(this.ch) >= 0;
};

// return tokens
Lexer.prototype.lex = function (text) {
  this.text = text;
  this.index = 0;
  this.ch = undefined;
  this.tokens = [];

  while (this.index < this.text.length) {
    this.ch = this.text.charAt(this.index);
    if (
      this.isNumber(this.ch) ||
      (this.is('.') && this.isNumber(this.peek()))
    ) {
      this.readNumber();
    } else if (this.is('\'"')) {
      this.readString(this.ch);
    } else if (this.is('[],{}:.')) {
      this.tokens.push({
        text: this.ch
      });
      this.index++;
    }
    else if (this.isIdent(this.ch)) {
      this.readIdent();
    } else if (this.isWhitespace(this.ch)) {
      this.index++;
    } else {
      throw 'Unexpected next character: ' + this.ch;
    }
  }

  return this.tokens;
};

Lexer.prototype.peek = function () {
  // console.log("Lexer.prototype.peek");
  return this.index < this.text.length - 1
    ? this.text.charAt(this.index + 1)
    : false;
};

Lexer.prototype.isNumber = function (ch) {
  return '0' <= ch && ch <= '9';
};

Lexer.prototype.isExpOperator = function (ch) {
  return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.isIdent = function (ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
    || ch === '_' || ch === '$';
}

Lexer.prototype.isWhitespace = function (ch) {
  return ch === ' ' || ch == '\r' || ch === '\t' || ch === '\n'
    || ch === '\v' || ch === '\u00A0';
}

Lexer.prototype.readIdent = function () {
  var text = '';
  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);
    if (this.isIdent(ch) || this.isNumber(ch)) {
      text += ch;
    }
    else {
      break;
    }
    this.index++;
  }

  var token = {
    text: text,
    identifier: true
  };

  this.tokens.push(token);
}

Lexer.prototype.readString = function (quote) {
  // console.log("Lexer.prototype.readString");

  this.index++;
  var string = '';
  var escape = false;

  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);

    if (escape) {
      if (ch === 'u') {
        var hex = this.text.substring(this.index + 1, this.index + 5);
        if (!hex.match(/[\da-f]{4}/i)) {
          throw "Invalid unicode escape";
        }
        this.index += 4;
        string += String.fromCharCode(parseInt(hex, 16));
      }
      else {
        var replacement = ESCAPES[ch];
        if (replacement) {
          string += replacement;
        } else {
          string += ch;
        }
      }
      escape = false;
    } else if (ch === quote) {
      this.index++;
      this.tokens.push({
        text: string,
        value: string,
      });
      return;
    } else if (ch === '\\') {
      escape = true;
    } else {
      string += ch;
    }

    this.index++;
  }

  throw 'Unmatched quote';
};

Lexer.prototype.readNumber = function () {
  // console.log("Lexer.prototype.readNumber");

  var number = '';

  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index).toLowerCase();
    if (ch === '.' || this.isNumber(ch)) {
      number += ch;
    } else {
      var nextCh = this.peek();
      var prevCh = number.charAt(number.length - 1);
      if (ch === 'e' && this.isExpOperator(nextCh)) {
        number += ch;
      } else if (
        this.isExpOperator(ch) &&
        prevCh === 'e' &&
        nextCh &&
        this.isNumber(nextCh)
      ) {
        number += ch;
      } else if (
        this.isExpOperator(ch) &&
        prevCh === 'e' &&
        (!nextCh || !this.isNumber(nextCh))
      ) {
        throw 'Invalid exponent';
      } else {
        break;
      }
    }
    this.index++;
  }

  this.tokens.push({
    text: number,
    value: Number(number),
  });
};

// abstract syntax tree, gets an lexer as argument
function AST(lexer) {
  this.lexer = lexer;
}

AST.program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';
AST.ThisExpression = 'ThisExpression';
AST.LocalsExpression = 'LocalsExpression';
AST.MemberExpression = 'MemberExpression';

AST.prototype.constants = {
  'null': { type: AST.Literal, value: null },
  'true': { type: AST.Literal, value: true },
  'false': { type: AST.Literal, value: false },
  'this': { type: AST.ThisExpression },
  '$locals': { type: AST.LocalsExpression }
};

// the Parser object also takes a lexer as argument, and_
// creates an AST and an AST compiler
function Parser(lexer) {
  //console.log("function Parser");
  this.lexer = lexer;
  this.ast = new AST(this.lexer);
  this.astCompiler = new ASTCompiler(this.ast);
}

Parser.prototype.parse = function (text) {
  // console.log("Parser.prototype.parse");
  return this.astCompiler.compile(text);
};

// return the AST from the root (program)
AST.prototype.ast = function (text) {
  // console.log("AST.prototype.ast");
  this.tokens = this.lexer.lex(text);
  return this.program();
};

AST.prototype.peek = function (e) {
  // console.log("AST.prototype.peek");
  if (this.tokens.length > 0) {
    var text = this.tokens[0].text;
    if (text === e || !e) {
      return this.tokens[0];
    }
  }
};

AST.prototype.arrayDeclaration = function () {
  // console.log("AST.prototype.arrayDeclaration");
  var elements = [];
  if (!this.peek(']')) {
    do {
      if (this.peek(']')) {
        break;
      }
      elements.push(this.primary());
    } while (this.expect(','));
  }
  this.consume(']');
  return { type: AST.ArrayExpression, elements: elements };
};

AST.prototype.consume = function (e) {
  var token = this.expect(e);
  if (!token) {
    throw 'Unexpected. Expecting: ' + e;
  }
  return token;
}

AST.prototype.program = function () {
  // console.log("AST.prototype.program");
  return { type: AST.Program, body: this.primary() };
};

AST.prototype.expect = function (e) {
  if (this.tokens.length > 0) {
    if (this.tokens[0].text === e || !e) {
      return this.tokens.shift();
    }
  }
};

AST.prototype.object = function () {
  var properties = [];
  if (!this.peek('}')) {
    do {
      var property = { type: AST.Property };

      if (this.peek().identifier) {
        property.key = this.identifier()
      }
      else {
        property.key = this.constant();
      }

      this.consume(':');
      property.value = this.primary();
      properties.push(property);
    } while (this.expect(','));
  }
  this.consume('}');
  return { type: AST.ObjectExpression, properties: properties };
};

// Primary expressions: arrays, objects, variable, constants adn the dot operator.
// 
AST.prototype.primary = function () {
  var primary;
  if (this.expect('[')) {
    primary = this.arrayDeclaration();
  } else if (this.expect('{')) {
    primary = this.object();
  }
  else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
    primary = this.constants[this.consume().text];
  }
  else if (this.peek().identifier) {
    primary = this.identifier();
  }
  else {
    primary = this.constant();
  }
  while (this.expect('.')) {
    primary = {
      type: AST.MemberExpression,
      object: primary,
      property: this.identifier()
    };
  }
  return primary;
};

AST.prototype.identifier = function () {
  return { type: AST.Identifier, name: this.consume().text }
};

AST.prototype.constant = function () {
  return { type: AST.Literal, value: this.consume().value };
};

function ASTCompiler(astBuilder) {
  this.astBuilder = astBuilder;
}

ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;

ASTCompiler.prototype.stringEscapeFn = function (c) {
  return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
};

ASTCompiler.prototype.escape = function (value) {
  if (_.isString(value)) {
    return '\'' + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';
  } else if (_.isNull(value)) {
    return 'null';
  } else {
    return value;
  }
};

ASTCompiler.prototype.assign = function (id, value) {
  return id + "=" + value + ";";
};

ASTCompiler.prototype.if_ = function (test, consequent) {
  this.state.body.push('if(', test, '){', consequent, '}');
};

ASTCompiler.prototype.compile = function (text) {
  // console.log("ASTCompiler.prototype.compile");
  var ast = this.astBuilder.ast(text);
  this.state = { body: [], nextId: 0, vars: [] };
  this.recurse(ast);
  /* jshint -W054 */
  return new Function('s', 'l',
    (this.state.vars.length ?
      'var ' + this.state.vars.join(',') + ';' : ''
    ) + this.state.body.join(''));
  /* jshint +W054 */
};

ASTCompiler.prototype.nextId = function () {
  var id = "v" + (this.state.thisId++);
  this.state.vars.push(id);
  return id;
};

ASTCompiler.prototype.nonComputedMember = function (left, right) {
  return '(' + left + ').' + right;
};

ASTCompiler.prototype.not = function (e) {
  return '!(' + e + ')';
}

ASTCompiler.prototype.getHasOwnProperty = function (object, property) {
  return object + '&&(' + this.escape(property) + ' in ' + object + ')';
};

// executes the body of each ast node recursively
ASTCompiler.prototype.recurse = function (ast) {
  // console.log("ASTCompiler.prototype.recurse");
  var intoId;
  switch (ast.type) {
    case AST.Program:
      this.state.body.push('return ', this.recurse(ast.body), ';');
    case AST.Literal:
      //console.log(this.escape(ast.value));
      return this.escape(ast.value);
    case AST.ArrayExpression:
      var elements = _.map(ast.elements, _.bind(function (element) {
        return this.recurse(element);
      }, this));
      return '[' + elements.join(',') + ']';
    case AST.ObjectExpression:
      var properties = _.map(ast.properties, _.bind(function (property) {
        var key = property.key.type === AST.Identifier ? property.key.name :
          this.escape(property.key.value);
        var value = this.recurse(property.value);
        return key + ':' + value;
      }, this));
      return '{' + properties.join(',') + '}';
    case AST.Identifier:
      intoId = this.nextId();
      this.if_(this.getHasOwnProperty('l', ast.name),
        this.assign(intoId, this.nonComputedMember('l', ast.name)));
      this.if_(this.not(this.getHasOwnProperty('l', ast.name)) + ' && s',
        this.assign(intoId, this.nonComputedMember('s', ast.name)))
      return intoId;
    case AST.ThisExpression:
      return 's';
    case AST.LocalsExpression:
      return 'l';
    case AST.MemberExpression:
      intoId = this.nextId();
      var left = this.recurse(ast.object);
      this.if_(left, this.assign(intoId, this.nonComputedMember(left, ast.property.name)));
      return intoId;
  }
};

module.exports = parse;
