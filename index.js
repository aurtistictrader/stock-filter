var express = require('express')
var app = express();
var ftp = require('ftp-get');
var fs = require('fs');
var stream = require('stream');
var readline = require('readline');
var util = require('util');
var _ = require('lodash');
require('colors');

var pg = require('pg');
// var conString = process.env.DATABASE_URL ||  "postgres://localhost:5432/finance";

conString = "postgres://localhost:5432/finance";
client = new pg.Client(conString);

app.set('port', (process.env.PORT || 5000))
// app.set('port', (9001));
app.use(express.static(__dirname + '/public'))

app.get('/cronny', function(request, response) {
  	var url = 'ftp://ftp.nasdaqtrader.com/SymbolDirectory/nasdaqtraded.txt';
	ftp.get(url, 'private/nasdaqtraded.txt', function (err, res) {
		if (err) {
	        console.error(err);
	    } else {
			console.log('File download at ' + res);
	    }
	});
	var symbols = [];
	var data = fs.readFileSync('./private/nasdaqtraded.txt','utf-8');
	var lines = data.split("\n");
	var tracker = 0;
	var stringsymbols = "";
	lines.forEach(function(line) {
	  async(line, function(){
	  	tracker++;
	  	if (line.substr(0,1) === "Y") {
	    	var bar = line.substr(2,line.length).indexOf("|");
	    	// symbols.push("'" + line.substr(2, bar) + "'"); 
	    	symbols.push(line.substr(2, bar));
	    	stringsymbols += line.substr(2,bar) + "\n"; 
	    }
	    if(tracker === lines.length ) {
	      // final(symbols);
	      // write file and load yahoo stuff
	      	// var filteredSymbols = loadYahooData(symbols);
		    // console.log(symbols.length + " : " + (lines.length-4));
		 //  	fs.writeFile("./private/nasdaqsymbols.csv", stringsymbols, function(err) {
			//     if(err) {
			//         console.log(err);
			//     } else {
			// 		console.log("Completed writing symbols");
			//         console.log("The file was saved!");
			//     }
			// }); 
			// console.log("running");
	      	var stuff = loadYahooData(symbols);
	      	// console.log(stuff);
	    }
	    // console.log(symbols.length + " : " + lines.length-4);
	  })
	});

	// console.log(symbols);
	
});


app.get('/', function(request, response) {
  response.send('Hello World!')

  populateSymbols();
  // populateHistorical();
});

app.listen(app.get('port'), function() {
  	console.log("Node app is running at localhost:" + app.get('port'))

});

function populateSymbols() {
	var q = 'COPY symbols FROM \'/Users/chengpeng123/Documents/finance-app/private/nasdaqsymbolssaved.csv\' WITH CSV;';

	pg.connect(conString, function(err, client, done) {
	   client.query(q, function(err, result) {
	      done();
	      if(err) return console.error(err);
	      console.log("Completed importing symbols");
	   });
	});
};

function async(arg, callback) {
  // console.log('do something with \''+arg+'\', return 1 sec later');
  setTimeout(function() { callback(arg); }, 10);
};

function loadYahooData(SYMBOLS) {
	var YQL = require('yql');
	var newSymbols = [];
	var tracker = 0;
	var stringsymbols = "";
	SYMBOLS.forEach(function(SYMBOL) {
	  async(SYMBOL, function(results){
	  	var query = new YQL('select * from yahoo.finance.quote where symbol = \'' + SYMBOL + '\'');
		query.exec(function (error, response) {
		  	tracker++;
			if (error) {

			} else if (response.query.results != null) {
			    var quote = response.query.results.quote;
			    var percentageChange = parseFloat(quote.YearLow) / parseFloat(quote.LastTradePriceOnly);
			    var marketCap;
			    var capstring = quote.MarketCapitalization;

			    if (capstring == null) {
			    	
			    } else if ( capstring.indexOf("M") > 0) {
			    	marketCap = parseFloat(capstring.substring(0, capstring.length-2)) * 1000;
			    	// console.log(marketCap);

			    } else if ( capstring.indexOf("B") > 0) {
			    	marketCap = parseFloat(capstring.substring(0, capstring.length-2)) * 1000000;
			    	// console.log(marketCap);
			    }
			    if (capstring != null) {
				    var glico = marketCap * percentageChange;
				    var threemonthvolume = parseInt(quote.AverageDailyVolume);
				    var price = parseFloat(quote.LastTradePriceOnly);

				    if (glico > 500000 && threemonthvolume > 300000 && price > 2) {
				    	// remove from SYMBOLS
				    	newSymbols.push(SYMBOL);
				    	console.log(SYMBOL);
				    	stringsymbols+= SYMBOL + "\n";
					} else {

						// console.log("Not meeting requirements");
					}

					// console.log(SYMBOL);
					console.log(SYMBOLS.length + " : " + tracker);
					if (SYMBOLS.length === tracker ) {
						console.log("FINISHED PARSING ALL");
						fs.writeFile("./private/nasdaqsymbols.csv", stringsymbols, function(err) {
						    if(err) {
						        console.log(err);
						    } else {
								console.log("Writing filteredSymbols");
						    }
						}); 
						return newSymbols;
					}
				}
			}
		    // console.log(response.query.results);
		});
	  });
		
	});
};

function populateHistorical() {	
	// select a symbol from database
	// import historical data


	var yahooData = require('yahoo-finance');
	var now = new Date();
	var dateFormat = require('dateformat');
	var now = dateFormat(now, "isoDate");

	var years = 5;
	var past = (parseInt(now.substr(0,4)) - years) + now.substr(4);

	var q = 'SELECT * FROM symbols';

	client.connect();

    var query = client.query(q);

    query.on('row', function(row) {
    	yahooData.historical({
		  symbols: [ row.symbol ],
		  from: past,
		  to: now, 
		  period: 'd'
		}, function (err, result) {
		  if (err) { throw err; }
		  _.each(result, function (quotes, symbol) {
		  	if (quotes[0]) {
		  		console.log(quotes);
		  		client.query("INSERT INTO historical VALUES ($1)", quotes, function(err, res) {
		  			if (err) { console.log(err) };
		  			console.log(res);
		  		});
		  		// for (var i = 0; i < quotes.length; i++) {
			  		// console.log(quotes[i]);
			  		// var nestedq = "INSERT INTO historical VALUES ($1)";
					  	// "INSERT INTO historical (date, open, high, low, close, volume, adjClose, symbol)
					  	//  VALUES ($1)", [quotes[i].date, quotes[i].open, result.high, result.low, result.volume, result.adjClose, result.symbol]);
						
		  		// }
		  	}
		  });
		  
		  

		//   fs.writeFile("./private/data/" + SYMBOLS[i] + ".txt", result, function(err) {
		//     if(err) {
		//         console.log(err);
		//     } else {
		// 		// console.log("Completed writing symbols");
		//   //       console.log("The file was saved!");
		// 		console.log("File saved");
		//     }
		// }); 
			  // console.log(result.stringify());
		  	/*_.each(result, function (quotes, symbol) {
		    console.log(util.format(
		      '=== %s (%d) ===',
		      symbol,
		      quotes.length
		    ).cyan);
		    if (quotes[0]) {
		      // console.log(
		      //   '%s\n...\n%s',
		      //   JSON.stringify(quotes[0], null, 2),
		      //   JSON.stringify(quotes[quotes.length - 1], null, 2)
		      // );

		  	// console.log(quotes);
  		//         fs.writeFile("./private/data/" + SYMBOLS[i] + ".json", quotes[0], function(err) {
				//     if(err) {
				//         console.log(err);
				//     } else {
				// 		console.log("Completed writing symbols");
				//         console.log("The file was saved!");
				//     }
				// }); 
				// console.log("File saved");
		    } else {
		      console.log('N/A');
		    }
		  });*/
		});
	});
	query.on('end', function() { 
	  client.end();
	});
	// });

		
};






