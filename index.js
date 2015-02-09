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
  // response.send('This lists current stock symbols with given criteria');

  // populateSymbols(); // used for coping manual symbols to db
  // populateHistorical(); // gets all historical data

  // populateDifference(); // makes up for database difference and current day pricing

  // parse and output for now, later make it downloadable

  var resp = searchAndFilter(response);
  // response.send(resp);


});

app.listen(app.get('port'), function() {
  	console.log("Node app is running at localhost:" + app.get('port'))

});

function getMonth(monthValue) {
	if (monthValue <= 0) {
		var temp = ("0" + (12 - (monthValue + 1)));
		return temp.substr(temp.length-2);
	} else {
		return ("0" + monthValue).substr(monthValue.length-2);
	}
}
function searchAndFilter(response) {
	var potentialStocks = [];

	var now = new Date();
	var dateFormat = require('dateformat');
	var now = dateFormat(now, "isoDate");
	var pastYear = (parseInt(now.substr(0,4)) - 1) + now.substr(4);
	var pastFiveYear = (parseInt(now.substr(0,4)) - 5) + now.substr(4);
	var threeMonths = now.substr(0,5) + getMonth(parseInt(now.substr(5,7)) - 3) + now.substr(7);

	var q = "SELECT symbol FROM symbols";
	var yearHighQ = "SELECT max(adjClose) as adjClose FROM historical WHERE date >= '" + pastYear + "'";// symbol = '"
	var yearLowQ = "SELECT min(adjClose) as adjClose FROM historical WHERE date >= '" + pastYear + "'";// symbol = '";
	var fiveYearHighQ = "SELECT max(adjClose) as adjClose FROM historical WHERE date >= '" + pastFiveYear + "'";
	var currClosePriceQ = "SELECT adjClose FROM historical WHERE date <= '" + now + "'";

	var threeMonthHighLowQ = "SELECT (max(adjClose) / min(adjClose)) as adjClose FROM historical WHERE date >= '" + threeMonths + "'";
	client.connect();
	var newClient = new pg.Client("postgres://localhost:5432/finance"); 
	newClient.connect();

	// query all syms
	var generalq = client.query(q);
	var output = "";
	var csvoutput = "";
	var count = 0;
	generalq.on('row', function(symout) {
		var nestedshit = 
			newClient.query(yearLowQ + " AND symbol = '" + symout.symbol + " ';", function(err, res1) {	  			
				newClient.query(yearHighQ + " AND symbol = '" + symout.symbol + " ';", function(err, res2) {
		  			newClient.query(fiveYearHighQ + " AND symbol = '" + symout.symbol + " ';", function(err, res3) {
			  			newClient.query(currClosePriceQ + " AND symbol = '" + symout.symbol + "' ORDER BY date DESC LIMIT 1;", function(err, res4) {
				  			newClient.query(threeMonthHighLowQ + " AND symbol = '" + symout.symbol+ " ';", function(err, res5) {
					  			newClient.query("SELECT count(*) FROM symbols ;", function(err, res6) {

					  				// console.log(res1.rows[0].adjclose + " : " + res3.rows[0].adjclose);
								    if ( 	(res1.rows[0].adjclose < (res3.rows[0].adjclose * 0.5)) && 
								    		(1.40 < (res2.rows[0].adjclose / res1.rows[0].adjclose)) && 
								    		(res1.rows[0].adjclose < res4.rows[0].adjclose) && 
								    		(res4.rows[0].adjclose < (res3.rows[0].adjclose * 0.75)) &&
								    		(res5.rows[0].adjclose < 1.20)
								    		) {
								    	potentialStocks.push(symout.symbol);
								    	// console.log(potentialStocks);

										output += symout.symbol + ", ";
										csvoutput += symout.symbol + "\n";
										// if (symout.symbol.trim() === 'AAPL') {
										// 	console.log("current: " + res4.rows[0].adjClose);
										// 	console.log("5 yr high: " + res3.rows[0].close);
										// }
									    // console.log(symout.symbol);
								    }
								    count ++;
								    // console.log(count + " : " + res6.rows[0].count);
								    if (count == res6.rows[0].count) {
								    	// console.log(output);

								    	response.send(output.substr(0, output.length-1));
							    	 	fs.writeFile("./private/pickedstocks.csv", csvoutput, function(err) {
										    if(err) {
										        console.log(err);
										    } else {
												console.log("Completed writing stocks!");
										    }
										});
								    	newClient.end();
								    	client.end();
								    }
					  			});
					  		});	
				  		});	
			  		});	
		  		});	
			});
			/*
	    var oneyrlow = 
	    	newClient.query(yearLowQ + " AND symbol = '" + symout.symbol + " ';", function(err, res) {
		  			if (err) { console.log(err) };
					// console.log("Inserted Symbol: " + quotes[0].symbol);
					// console.log(res.rows[0].close);
					// oneyrlow = res.rows[0];
		  		});	
	    var oneyrhigh = 
	    	newClient.query(yearHighQ + " AND symbol = '" + symout.symbol + " ';", function(err, res) {
		  			if (err) { console.log(err) };
					// console.log("Inserted Symbol: " + quotes[0].symbol);
					// console.log(res.rows[0].close);
		  		});	
	    	
    	var fiveyearhigh = 
	    	newClient.query(fiveYearHighQ + " AND symbol = '" + symout.symbol + " ';", function(err, res) {
		  			if (err) { console.log(err) };
					// console.log("Inserted Symbol: " + quotes[0].symbol);
					// console.log(res.rows[0].close);
		  		});	
	    	
	    var currClosePrice = 
	    	newClient.query(currClosePriceQ + " AND symbol = '" + symout.symbol + "' ORDER BY date DESC LIMIT 1;", function(err, res) {
		  			if (err) { console.log(err) };
					// console.log("Inserted Symbol: " + quotes[0].symbol);
					// console.log(res.rows[0].close);
		  		});	
    	var threeMonthHighLow = 
	    	newClient.query(threeMonthHighLowQ + " AND symbol = '" + symout.symbol+ " ';", function(err, res) {
		  			if (err) { console.log(err) };
					// console.log("Inserted Symbol: " + quotes[0].symbol);
					// console.log(res.rows[0].close);
		  		});	
*/
	    // var oneyrhigh = newClient.query(yearHighQ + " AND symbol = " + symout.symbol + " ");
	    // var fiveyearhigh = newClient.query(fiveYearHighQ + " AND symbol = " + symout.symbol + " ");
	    // var currClosePrice = newClient.query(currClosePriceQ + " AND symbol = " + symout.symbol + " ");
	    // var threeMonthHighLow = newClient.query(threeMonthHighLowQ + "AND symbol = " + symout.symbol + " ");
	    // newClient.query('')
	    // console.log(yearLowQ + " AND symbol = '" + symout.symbol + " ';");
	    // console.log(symout.symbol);
	    // console.log(oneyrlow);
	    // console.log(oneyrhigh);
	    // console.log(fiveyearhigh);
	    // console.log(currClosePrice);
	    // console.log(threeMonthHighLow);
	    /*
	    if ( 	(oneyrlow.close < (fiveyearhigh.close * 0.5)) && 
	    		(1.40 < (oneyrhigh.close / oneyrlow.close)) && 
	    		(oneyrlow.close < currClosePrice.close) && 
	    		(currClosePrice.close < (fiveyearhigh.close * 0.75)) &&
	    		(threeMonthHighLow.close < 1.20)) {
	    	potentialStocks.push(symout.symbol);
		    console.log(symout.symbol);
	    }*/
	});

	// newClient.on('end', function() {
	// 	console.log("Closed client");
	// 	newClient.end();
	// });
    // query.on('row', function(){

    // });
    // generalq.on('end', function() {
    // 	console.log("Ended parse");

    // 	for (var i = 0; i < potentialStocks.length; i++) {
    // 		console.log(potentialStocks[i]);
    // 		output += potentialStocks[i] + "\n";
    // 	}
    // 	console.log(potentialStocks);
    // 	// return output;

    // 	// client.end();
    // });
};

// TODO
function populateDifference() {

};

function populateSymbols() {
	var q = 'COPY symbols FROM \'/Users/chengpeng123/Documents/finance-app/private/manualsymbols.csv\' WITH CSV;';

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
	// var past = '2014-06-05';
	// var next = '2014-06-10';
	var q = 'SELECT * FROM symbols';
	// var q = 'SELECT * FROM symbols WHERE symbol = \'AAPL\'';
	var newClient = new pg.Client("postgres://localhost:5432/finance");
	newClient.connect();
	client.connect();

    var query = client.query(q);

    query.on('row', function(row) {
    	yahooData.historical({
		  symbols: [ row.symbol ],
		  from: past,
		  to: now,
		  // to: next, 
		  period: 'd'
		}, function (err, result) {
		  if (err) { throw err; }
		  _.each(result, function (quotes, symbol) {
		  	if (quotes[0]) {
		  		// for (var i = 0; i < quotes.length; i++) {
			  		// var date = "'" + quotes[i].date + "'";
			  		// var open = quotes[i].open;
			  		// var high = quotes[i].high;
			  		// var low = quotes[i].low;
			  		// var volume = quotes[i].volume;
			  		// var adjClose = "'" + quotes[i].adjClose + "'";
			  		// var symbol = "'" + quotes[i].symbol + "'";
			  	// 	console.log(stuff);
		  		// }
			  		// var nestedq = "INSERT INTO historical VALUES ($1)";
		  			// var newQ = client.query(nestedq, quotes, function(err, res) {
			  		// 	if (err) { console.log(err) };
			  		// 	console.log("Inserted");
			  		// });
				// console.log(quotes);
		  		var nestedq = "INSERT INTO historical (date, open, high, low, close, volume, adjClose, symbol) VALUES ";
		  		for (var i = 0; i < quotes.length; i++) {
			  		// console.log(quotes[i]);
					var inp = [dateFormat(quotes[i].date, "isoDate"), quotes[i].open, quotes[i].high, quotes[i].low, quotes[i].close, quotes[i].volume, quotes[i].adjClose, quotes[i].symbol];
					nestedq += " ( "
					for (var j = 0; j < inp.length; j++) {
						if (j+1 == inp.length) {
							nestedq += "'" + inp[j] + "'";
						} else {
							nestedq += "'" + inp[j] + "', ";
						}
						// console.log(nestedq);
					}
					// nestedq.substr(0,nestedq.length-2);
					nestedq +=" ), "
					// var inp = [date, open, high, low, volume, adjClose, symbol];
			  		// console.log(inp);
		  		}
				var newQ = newClient.query(nestedq.substr(0,nestedq.length-2) + ";", function(err, res) {
		  			if (err) { console.log(nestedq.substr(0,nestedq.length-2)) };
					console.log("Inserted Symbol: " + quotes[0].symbol);

		  		});
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
	newClient.on('end', function(){
		console.log("DONE");
		newClient.end();
	});
	query.on('end', function() { 
	  client.end();
	});
	// });

		
};






