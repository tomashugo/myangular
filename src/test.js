function myReturnedFunction() {
    return new Function('s', 'return console.log(s);')
}

var a = myReturnedFunction();
a("Hugo")