var express = require('express')
var app = express();
var ftp = require('ftp-get');
var fs = require('fs');
var stream = require('stream');
var readline = require('readline');
var util = require('util');
var _ = require('lodash');
require('colors');

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.get('/cron', function(request, response) {
  	var url = 'ftp://ftp.nasdaqtrader.com/SymbolDirectory/nasdaqtraded.txt';
	ftp.get(url, 'private/nasdaqtraded.txt', function (err, res) {
		if (err) {
	        console.error(err);
	    } else {
			console.log('File download at ' + res);
	    }
	});
	var symbols = [];
	var instream = fs.createReadStream('./private/nasdaqtraded.txt');
	var outstream = new stream;
	var rl = readline.createInterface(instream, outstream);
	var size = 0;
	rl.on('line', function(line) {
	  // process line here
  	    if (line.substr(0,1) === "Y") {
	    	var bar = line.substr(2,line.length).indexOf("|");
	    	// symbols.push("'" + line.substr(2, bar) + "'"); 
	    	symbols.push(line.substr(2, bar)); 
	    	size++;
	    }
	});

	rl.on('close', function() {
	  // do something on finish here
	  	fs.writeFile("./private/nasdaqsymbols.csv", symbols, function(err) {
		    if(err) {
		        console.log(err);
		    } else {
				console.log("Completed writing symbols");
		        console.log("The file was saved!");
		    }
		}); 
		// load yahoo data
		loadYahooData(symbols,size);
	});

	// use yahoo api to load data and parse them
	
});

app.get('/', function(request, response) {
  response.send('Hello World!')

});

app.listen(app.get('port'), function() {
  	console.log("Node app is running at localhost:" + app.get('port'))

});


function loadYahooData(SYMBOLS,size) {
	var yahooData = require('yahoo-finance');
	var now = new Date();
	var dateFormat = require('dateformat');
	var now = dateFormat(now, "isoDate");

	var years = 5;

	var past = (parseInt(now.substr(0,4)) - years) + now.substr(4);
	// console.log(past);
	// console.log(SYMBOLS);
	console.time('grab all symbols');

	var YQL = require("YQL");
	// //select * from csv where url='http://download.finance.yahoo.com/d/quotes.csv?s=YHOO,GOOG,AAPL&f=sl1d1t1c1ohgv&e=.csv' and columns='symbol,price,date,time,change,col1,high,low,col2'
	
	
	// Grab current info and eliminate the ones that are uneeded

	var total;
	for (var i = 0; i < SYMBOLS.length; i++) {
		var query = new YQL('select * from yahoo.finance.quote where symbol = \'' + SYMBOLS[i] + '\'');
		query.exec(function (error, response) {

		    if (response.query.results != null) {
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
				    var 3monthvolume = parseInt(quote.AverageDailyVolume);
				    var price = parseFloat(quote.LastTradePriceOnly);

				    if (glico > 500000 && 3monthvolume > 300000 && price > 2) {
				    	// COPY + PARSE INTO DATABASE

				    	console.log(quote.symbol);
					} else {
						// console.log("Not meeting requirements");
					}
				}
			}
		    // console.log(response.query.results);
		});
		total = i;
	}
	console.log(total);



	// Loop through every symbol, throw shit into DB?
	for (var i = 0; i < 0; i++) {
		yahooData.historical({
		  symbols: [SYMBOLS[i]],
		  from: past,
		  to: now, 
		  period: 'd'
		}, function (err, result) {
		  if (err) { throw err; }
			console.log(result);
			// quotes = _.toArray(result);
			// console.log(quotes);
		  fs.writeFile("./private/data/" + SYMBOLS[i] + ".txt", result, function(err) {
		    if(err) {
		        console.log(err);
		    } else {
				// console.log("Completed writing symbols");
		  //       console.log("The file was saved!");
				console.log("File saved");
		    }
		}); 
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

	}

	console.timeEnd('grab all symbols');
	// console.log(yahooData);
};









