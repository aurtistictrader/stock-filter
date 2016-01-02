var express = require('express')
var app = express();
var ftp = require('ftp-get');
var fs = require('fs');
var stream = require('stream');
var readline = require('readline');
var util = require('util');
var _ = require('lodash');
var async = require('async');
require('colors');

var pg = require('pg');
// var conString = process.env.DATABASE_URL ||  "postgres://localhost:5432/finance";

conString = "postgres://localhost:5432/finance";
client = new pg.Client(conString);

app.set('port', (process.env.PORT || 5000))

app.use(express.static(__dirname + '/public'))

// This updates the nasdaq symbols in the market and stores them in a csv file for use later
app.get('/update_nasdaq_symbols', function(request, response) {
	updateSymbols();
});

/** Reduce a large array by a given factor.
  */
var reduceArray = function(array, factor) {
	var newArray = [];
	for (var i = 0; i < array.length; i+=factor) {
		if (i + factor >= array.length) {
			var nextArray = array.slice(i, array.length);
			newArray.push(nextArray);		
		} else {
			var nextArray = array.slice(i, i + factor);
			newArray.push(nextArray);	
		}
	}

	return newArray;
}

/** Flattens an array of arrays.
  */
var flattenArray = function(array) {
	var merged = [].concat.apply([], array);
	return merged;
}

/** Filter a symbol if it's undefined.
  */
var removeUndefined = function(string, callback) {
	if (typeof string == 'undefined' || string === undefined) {
		return callback(false);
	} 
	callback(true);
};

/** Formats a symbol based on nasdaq trading stocks.
  */
var formatSymbol = function(nasdaqLine, callback) {
	if (nasdaqLine.substr(0,1) === "Y") {
		var bar = nasdaqLine.substr(2,nasdaqLine.length).indexOf("|");
		return callback(null, nasdaqLine.substr(2, bar));
	}
	callback();
};

/** Simply grabs the symbol value from a quote object 
  */
var quoteToSymbol = function(quote, callback) {
	if (quote) {
		return callback(null, quote.symbol);
	}
	callback();
};

/** Filters a quote object with volume, market cap, and price restraints. 
  */
var basicRestraints = function(quote, callback) {
    // var percentageChange = parseFloat(quote.YearLow) / parseFloat(quote.LastTradePriceOnly);
    var marketCap;
    var capstring = quote.MarketCapitalization;

    if (capstring == null) {
    	
    } else if ( capstring.indexOf("M") > 0) {
    	// Convert million to thousands
    	marketCap = parseFloat(capstring.substring(0, capstring.length-2)) * 1000;
    } else if ( capstring.indexOf("B") > 0) {
    	// Convert billion to thousands
    	marketCap = parseFloat(capstring.substring(0, capstring.length-2)) * 1000000;
    }

    if (capstring != null) {
	    // var glico = marketCap * percentageChange;
	    var threemonthvolume = parseInt(quote.AverageDailyVolume); 
	    var price = parseFloat(quote.LastTradePriceOnly); // Ensures non-toxic stocks

	    // Check for market cap at least 500 mill, at least 50000 average volume
	    if (marketCap > 500000 && threemonthvolume > 50000 && price > 2) {
	    	return callback(true);
		}
	}

	return callback(false);
}

/** Filters an array of symbols based on custom requirements, using YQL.
  * Some requirements include volume minimum, and fair price. 
  */
var filterSymbols = function(symbols, callback) {
	var YQL = require('yql');

	custom_async(symbols, function(results) {
	  	var queryString = 'select * from yahoo.finance.quote where symbol in (';
  		for (var i = 0; i < symbols.length-1; i++) {
  			queryString += '"' + symbols[i] + '",';
  		}
  		queryString += '"' + symbols[symbols.length-1] + '")';

	  	var query = new YQL(queryString);
		query.exec(function (error, response) {
			if (error) {
				console.log("Error when filtering symbol: " + symbols + ", " + error);
				if (error.message.indexOf('ETIMEDOUT') > 0 || error.message.indexOf('ENOTFOUND') > 0 || error.message.indexOf('ECONNRESET') > 0) {
					return filterSymbols(symbols, callback);
				}
				return callback();
			} else if (response.query.results != null) {
			    var quotes = response.query.results.quote;

			    async.filter(quotes, basicRestraints, function(result) {
			    	if (result) {
			    		console.log("Filtered");
						return callback(null, result);	
			    	} else {
			    		return callback();
			    	}
			    });
			}
		});
	});
};

function updateSymbols() {	
	async.series({
		download: function(callback) {
			var url = 'ftp://ftp.nasdaqtrader.com/SymbolDirectory/nasdaqtraded.txt';
			ftp.get(url, 'private/nasdaqtraded.txt', function (err, res) {
				if (err) {
			        console.error(err);
			    } else {
					console.log('File download at ' + res);
			   		return callback(null, '');
			    }
			});
		},
		symbols: function(callback) {
			var data = fs.readFileSync('./private/nasdaqtraded.txt','utf-8');
			var lines = data.split("\n");
			
			async.waterfall([
				function(callback) {
					async.map(lines, formatSymbol, function(err, result) {
						if (err) {
							console.log('error in formating symbols: ' + err);
						}
						return callback(err, result);
					});	
				},
				function(symbols, callback) {
					async.filter(symbols, removeUndefined, function(result) {
						console.log("Finished formatting symbols.");
						return callback(null, result);
					});	
				}
			], function (err, results) {
				if (err) {
					console.log(err);
				}

				var newArray = reduceArray(results, 20);

				async.mapSeries(newArray, filterSymbols, function(err, result) {
					if (err) {
						console.log('error in filtering symbols: ' + err);
					}

					newResult = flattenArray(result);
					
					console.log("Finished obtaining data");
					async.waterfall([
						function(callback) {
							async.map(newResult, quoteToSymbol, function(err, symbols) {
								callback(null, symbols);
							});
						},
						function(symbols, callback) {
							var symbolString = "";
							for (var i = 0; i < symbols.length; i++) {
								symbolString += symbols[i] + '\n';
							}
							callback(null, symbolString);
						},
						function(symbolString, callback) {
							fs.writeFile("./private/manualsymbols.csv", symbolString, function(err) {
							    if (err) {
							        console.log(err);
							    } else {
									console.log("Finished writing symbols to file.");
							    }
							}); 
							callback();
						}
					], function (err, result) {
						if (err) {
							console.log(err);
						}

						populateSymbols(); // Stores into database
					});
				});	
			});
		}
	}, function (err, results) {
		if (err) {
			console.log(err);
		}
	});
};

app.get('/', function(request, response) {
  // response.send('This lists current stock symbols with given criteria');

  // populateSymbols(); // used for coping manual symbols to db
  // populateHistorical(); // gets all historical data

  // populateDifference(); // makes up for database difference and current day pricing

  	filterByMovingAverage(); // Search stocks based on ma

  // parse and output for now, later make it downloadable
  // var resp = searchAndFilter(response);
  // response.send(resp);
});

app.listen(app.get('port'), function() {
  	console.log("Node app is running at localhost:" + app.get('port'))
});

function getYearMonth(yearValue, monthValue) {
	if (monthValue <= 0) {
		var temp = ("0" + (12 - (monthValue + 1)));
		temp = temp.substr(temp.length-2);
		yearValue = yearValue - 1;
		return yearValue + "-" + temp;
	} else {
		return yearValue + ("0" + monthValue).substr(monthValue.length-2);
	}
}

/** Calculates moving average for a symbol depending on maType
  * @maTypeSymbol { maType: 5, symbol: 'AAPL'}
  */
var calculateMovingAverage = function(maTypeSymbol, callback) {
	var maType = maTypeSymbol.maType;
	var symbol = maTypeSymbol.symbol;
	var q = 
		"WITH NumberedRows " +
		"AS ( " +
			"SELECT  rta.adjclose, rta.date, row_number() OVER (ORDER BY rta.date ASC) AS RowNumber " +
			"FROM    historical_weekly rta " +
			"WHERE   rta.symbol = '" + symbol + "' " +
		") " +

		"SELECT  nr.date, nr.adjclose, " +
			"CASE " + 
				"WHEN nr.RowNumber <= " + maType + " THEN NULL " +
				"ELSE (	SELECT	avg(adjclose) " +
				"FROM	NumberedRows " + 
				"WHERE	RowNumber <= nr.RowNumber " +
				"AND 	RowNumber >= nr.RowNumber - " + maType +  " " + 
			") " +
			"END AS MovingAverage " +
		"FROM    NumberedRows nr " +
		"ORDER BY date DESC";

	client.query(q, function(err, result) {
		if (err) { console.log(err); }

		async.map(result.rows, formatMovingAverageFromDatabase, function(err, result) {
			if (err) { console.log(err); }
			callback(null, result);
		});
	});
};

function filterByMovingAverage() {
	var settings = getMovingAverageSettings();

	var q = "SELECT DISTINCT symbol FROM symbols LIMIT 1";

	client.connect();
	
	async.waterfall([
		function(callback) {
			client.query(q, function(err, result) {
				if (err) { console.log(err); }	
				callback(null, result.rows);
			});
		},
		function(rows, callback) {
			async.map(rows, formatSymbolsFromDatabase, function(err, symbols) {
				var pickedSymbols = [];

				async.each(symbols, function(symbol, callback) {	
					console.log("Calculating... " + symbol);
					var newMaSymbols = [];
					for (var i = 0; i < settings.maTypes.length; i++) {
						newMaSymbols.push({ maType: settings.maTypes[i], symbol: symbol });
					}

					async.map(newMaSymbols, calculateMovingAverage, function(err, results) {
						if (err) {
							console.log(err);
						} 

						async.map(results, calculateDifferences, function(err, results) {
							if (err) {
								console.log(err);
							} 							
								
						}

						// var symbol = hasReasonableDifferences(result);
						// if (symbol) {
						// 	pickedSymbols.push(symbol);
						// 	console.log("picked: " + symbol);
						// }
					});
					callback();
				});

				callback(null, pickedSymbols);
			});
		}
	]);		
};

/** Calculates moving averages based on table, time period, startDate
  *
  */
function getMovingAverageSettings() {
	var endDate = new Date();
	var dateFormat = require('dateformat');
	var endDate = dateFormat(startDate, "isoDate");

	var years = 10;
	var startDate = (parseInt(endDate.substr(0,4)) - years) + endDate.substr(4);

	return {
		'tableName' : 'historical_weekly',
		'maTypes' : [5, 13, 34, 89, 240],
		'period': 'w',
		'latestPeriods' : 21,
		'startDate' : startDate, 
		'endDate': endDate
	};
};

function searchAndFilter(response) {
	// Current strategy: LONG TERM BOTTOM UP
	var potentialStocks = [];

	var now = new Date();
	var dateFormat = require('dateformat');
	var now = dateFormat(now, "isoDate");
	var pastYear = (parseInt(now.substr(0,4)) - 1) + now.substr(4);
	var pastTwoYear = (parseInt(now.substr(0,4)) - 2) + now.substr(4);
	var pastFiveYear = (parseInt(now.substr(0,4)) - 5) + now.substr(4);
	var threeMonths = getYearMonth(parseInt(now.substr(0,4)), parseInt(now.substr(5,7)) - 3) + now.substr(7);
	var q = "SELECT DISTINCT symbol FROM symbols";
	var oneYearHighQ = "SELECT max(adjClose) as adjClose FROM historical WHERE date >= '" + pastYear + "'";// symbol = '"
	// var oneYearHighQ = "SELECT max(adjClose) as adjClose FROM historical WHERE date >= '" + pastTwoYear + "'";// symbol = '"
	// var yearLowQ = "SELECT min(adjClose) as adjClose, date FROM historical WHERE date >= '" + pastYear + "'";// symbol = '";
	var fiveYearHighLowQ = "SELECT max(adjClose) as adjCloseH, min(adjClose) as adjCloseL FROM historical WHERE date >= '" + pastFiveYear + "'";
	var fourYearHighLowQ = "SELECT max(adjClose) as adjCloseH, min(adjClose) as adjCloseL FROM historical WHERE date >= '" + pastFiveYear + "' AND date <= '" + pastTwoYear + "'";
	var currClosePriceQ = "SELECT adjClose FROM historical WHERE date <= '" + now + "'";

	var threeMonthHighLowQ = "SELECT max(adjClose) as adjCloseH, min(adjClose) as adjCloseL FROM historical WHERE date >= '" + threeMonths + "'";
	client.connect();
	var newClient = new pg.Client("postgres://localhost:5432/finance"); 
	newClient.connect();

	var yearHighQ = "adjClose = (SELECT MAX(adjClose) as adjClose FROM historical where date >= '" + pastTwoYear + "' AND symbol='";
	var yearLowQ = "adjClose = (SELECT MIN(adjClose) as adjClose FROM historical where date >= '" + pastTwoYear + "' AND symbol='";
	// query all syms
	var generalq = client.query(q);
	var output = "";
	var csvoutput = "";
	var count = 0;

	var YQL = require('yql');
	
	generalq.on('row', function(symout) {

		async.parallel({
		    res1: function(callback) {
		    	// console.log("res1");
		    	newClient.query("SELECT adjClose, date FROM historical WHERE symbol = '" 
		    		+ symout.symbol + " ' AND " + yearLowQ + symout.symbol + "');", function(err, res1) {
		        	callback(null, res1);
		    	});
		    },
		    res2: function(callback) {
		    	// console.log("res2");
				newClient.query("SELECT adjClose, date FROM historical WHERE symbol = '" 
					+ symout.symbol + " ' AND " + yearHighQ + symout.symbol + "');", function(err, res2) {
		        	callback(null, res2);
				});
		    },
		    res3: function(callback) {
		    	// console.log("res3");
				newClient.query(fourYearHighLowQ + " AND symbol = '" + symout.symbol + " ';", function(err, res3) {
		        	callback(null, res3);
				});
		    },
		    res4: function(callback) {		
		    	// console.log("res4");	  			
		    	newClient.query(currClosePriceQ + " AND symbol = '" + symout.symbol + "' ORDER BY date DESC LIMIT 1;", function(err, res4) {    	
			        callback(null, res4);
			    });
		    },
		    res5: function(callback) {
		    	// console.log("res5");
				newClient.query(fiveYearHighLowQ + " AND symbol = '" + symout.symbol+ " ';", function(err, res5) {
		        	callback(null, res5);
				});
		    },
		    res6: function(callback) {
		    	// console.log("res6");
				newClient.query("SELECT count(DISTINCT symbol) FROM symbols ;", function(err, res6) {
		        	callback(null, res6);
				});
		    },
		    res7: function(callback) {
		    	// console.log("res7");
				newClient.query(oneYearHighQ + " AND symbol = '"  + symout.symbol + " ';", function(err, res7) {
		        	callback(null, res7);
				});
		    },
		    response: function(callback) {
				var query = new YQL("select * from csv where url='http://download.finance.yahoo.com/d/quotes.csv?s=" + symout.symbol.trim() + '&f=m6\'');
				query.exec(function (error, response) {
					callback(null, response);
				});
		    }
		}, function (err, result) {
			var res1 = result.res1;
			var res2 = result.res2;
			var res3 = result.res3;
			var res4 = result.res4;
			var res5 = result.res5;
			var res6 = result.res6;
			var res7 = result.res7;
			var response = result.response;
			
			if (response === null) {
				console.log("YQL Query Error");
				count++;
			} else if (response.query.results != null) {
			    var quote = response.query.results.row;
			    var capstring = quote;

			    if (capstring != null) {
			    	// This is the change between the current price and the 200 day moving average 
				    var percentagetwohundredMA = parseInt(capstring.col0.substr(0,capstring.col0.length-1));
				    if (percentagetwohundredMA >= -5 && 
				    	percentagetwohundredMA <= 40 ) {
				    	// more conditions go here
				    	// TODO: Setup an easy method for meeting condiitions 
				    	// Probably consider writing a function that takes in parameters, changing conditions on them
				    	// This way, it is also possible to do some dynamic adjustments based on user preferences
					    // if res7.rows[0].adjclose < res4.rows[0].adjclose {
					    // 	console.log("True: " + res7.rows[0].adjclose + " < " + res4.rows[0].adjclose)
					    // }
					    // console.log("True: " + res7.rows[0].adjclose + " < " + res4.rows[0].adjclose)
					    
						if (typeof res1.rows[0] != 'undefined' 
							&& res2.rows[0] != 'undefined'
							&& res3.rows[0] != 'undefined'
							&& res4.rows[0] != 'undefined'
							&& res7.rows[0] != 'undefined')

					    if ( 	
				    		// For bull
				    		// 50% increase from one year low to one year high
				    		(res1.rows[0].adjclose * 1.5 < res2.rows[0].adjclose && 
				    		 res1.rows[0].date < res2.rows[0].date	) &&
				    		// 15% current price lower than 1 yr high
				    		// (res4.rows[0].adjclose < res2.rows[0].adjclose * 0.85) &&
				    		// first 4 year high price * 1.3 > 1yearhigh
				    		(res3.rows[0].adjcloseh * 1.3 > res7.rows[0].adjclose ) &&
				    		(res3.rows[0].adjclosel < res4.rows[0].adjclose)
							

							// Bear
							// half year instead of 1 year, 20-25 %
							// (res1.rows[0].adjclose >= (res5.rows[0].adjcloseh - res5.rows[0].adjclosel)*0.7 + res5.rows[0].adjclosel) //&&
							// (res5.rows[0].adjcloseh > 5 * res5.rows[0].adjclosel)

				    		// (res1.rows[0].adjclose < (res3.rows[0].adjcloseh * 0.5)) && 
				    		// (1.40 < (res2.rows[0].adjclose / res1.rows[0].adjclose)) && 
				    		// (res3.rows[0].adjclosel < res4.rows[0].adjclose) && 
				    		// (res4.rows[0].adjclose < (res3.rows[0].adjcloseh * 0.75)) &&
				    		// ((res5.rows[0].adjcloseh / res5.rows[0].adjclosel) < 1.20) &&
				    		// (res5.rows[0].adjclosel > res3.rows[0].adjclosel) &&
				    		// (res1.rows[0].adjclose > res3.rows[0].adjclosel)
				    		) {
					    	potentialStocks.push(symout.symbol);
						    console.log(symout.symbol);

							output += symout.symbol + ", ";
							csvoutput += symout.symbol + "\n";
					    }
					    count ++;
					    if (count == res6.rows[0].count) {
					    	// response.send(output.substr(0, output.length-1));
				    	 	fs.writeFile("./private/pickedstocks.csv", csvoutput, function(err) {
							    if(err) {
							        console.log(err);
							    } else {
									console.log("Completed writing stocks!");
							    }
							});
					    	newClient.end();
					    	client.end();
					    	return output;
					    }
					} else {
						count++;
					}	
				} else {
					console.log("CAPSTINRG IS NULL FOR: " + symout.symbol.trim());
					count++;
				}

		 	} else {
		 		console.log("Symbol is null: " + symout.symbol.trim());
		 		count++;
		 	}
		});
	});
};

// This function populates the database depending on the difference in days
// This should be run Daily
function populateDifference() {

	client.connect();
	var newClient = new pg.Client("postgres://localhost:5432/finance"); 
	newClient.connect();

	// Grabs most recent date
	var symbolsQuery = 'SELECT * FROM symbols';
	var mostRecentDateQuery = 'SELECT date FROM historical ORDER BY date DESC LIMIT 1';

	var yahooData = require('yahoo-finance');
	var now = new Date();
	var dateFormat = require('dateformat');
	var now = dateFormat(now, "isoDate");

	client.query(mostRecentDateQuery).on('row', function(row) {
		// Check if date is current, if NOT, query and make up the difference
		var lastDate = dateFormat(row.date, "isoDate");
		if (lastDate < now) {
			console.log("UPDATING WITH NEWER DATA");
			client.query(symbolsQuery).on('row', function(row) {
		    	yahooData.historical({
				  symbols: [ row.symbol ],
				  from: lastDate,
				  to: now,
				  // to: next, 
				  period: 'd'
				}, function (err, result) {
				  if (err) { throw err; }
				  _.each(result, function (quotes, symbol) {
				  	if (quotes[0]) {
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
							}
							nestedq +=" ), "
				  		}
						var newQ = newClient.query(nestedq.substr(0,nestedq.length-2) + ";", function(err, res) {
				  			if (err) { console.log(nestedq.substr(0,nestedq.length-2)) };
							console.log("Inserted Symbol: " + quotes[0].symbol);
				  		});
				  	}
				  });
				});
			});
		}
	});		 
	newClient.on('end', function(){
		console.log("DONE");
		newClient.end();
	});
};

// manually populates all of the symbols from the csv into the database
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

/** Custom async function
  * @Deprecated
  */ 
function custom_async(arg, callback) {
  setTimeout(function() { callback(arg); }, 10);
};

/** Populates a histroical data table based on given symbols and
  * configured settings at grabHistoricalSettings();
  */
var populateHistoricalData = function(symbolArray, callback) {
	var settings = grabHistoricalSettings();
	var dateFormat = require('dateformat');
	var yahooData = require('yahoo-finance');

	yahooData.historical({
	  symbols: 	symbolArray,
	  from: 	settings.startDate,
	  to: 		settings.endDate,
	  period: 	settings.period
	}, function (err, result) {
	  	if (err) { 
	  		console.log(err);
	  		return populateHistoricalData(symbolArray, callback); 
	  	}
  		
  		var insertSetup = "INSERT INTO " + settings.tableName + " (date, open, high, low, close, volume, adjClose, symbol) VALUES ";

		async.forEachOf(result, function(quotes, symbol, callback) {
			if (quotes[0]) {
				for (var i = 0; i < quotes.length; i++) {
					var row = [dateFormat(quotes[i].date, "isoDate"), quotes[i].open, quotes[i].high, quotes[i].low, quotes[i].close, quotes[i].volume, quotes[i].adjClose, quotes[i].symbol];
					insertSetup += " ( ";
					for (var j = 0; j < row.length; j++) {

						if (j + 1 == row.length) {
							insertSetup += "'" + row[j] + "'";
						} else {
							insertSetup += "'" + row[j] + "', ";
						}
					}
					insertSetup +=" ), ";
				}
			}
			callback();
		}, function(err) {
			if (err) { throw err; }

			client.query(insertSetup.substr(0, insertSetup.length-2) + ";", function(err, res) {
	  			if (err) { console.log(err) };
				console.log("Inserted Symbols: " + symbolArray);
	  		});
		});

		return callback();
	});
};

/* Grabs database symbol object and simplifies into moving average value
 */
var formatMovingAverageFromDatabase = function(movingAverageData, callback) {
	callback(null, movingAverageData.movingaverage);
};

/* Grabs database symbol object and simplifies into trimmed symbol
 */
var formatSymbolsFromDatabase = function(symbolData, callback) {
	callback(null, symbolData.symbol.trim());
};

/* Grabs database symbol object and simplifies into adjclose data
 */
var formatAdjcloseFromDatabase = function(adjcloseData, callback) {
	callback(null, adjcloseData.adjclose);
};

/** Customize type of data and where to be populated: table, period, startDate, endDate
  */
function grabHistoricalSettings() {
	var endDate = new Date();
	var dateFormat = require('dateformat');
	var endDate = dateFormat(startDate, "isoDate");

	var years = 10;
	var startDate = (parseInt(endDate.substr(0,4)) - years) + endDate.substr(4);

	return {
		'tableName' : 'historical_weekly', 
		'period' : 'w', 
		'startDate' : startDate, 
		'endDate': endDate
	};
};

/** Populates all of the historical data based on configured settings
  * at grabHistoricalSettings();
  */
function populateHistorical() {	
	var yahooData = require('yahoo-finance');

	var q = 'SELECT symbol FROM symbols';
	client.connect();

	async.waterfall([
		function(callback)  {
			client.query(q, function(err, symbols) {
				if (err) { console.log(err); }
				console.log("finished grabbing symbols");

				if (typeof symbols == 'undefined') {
					return callback();
				}

				async.filter(symbols.rows, removeUndefined, function(result) {
					async.map(result, formatSymbolsFromDatabase, function(err, result) {
						if (err) { console.log("format error: " + err); }
						callback(err, result);
					});
				});
		    });	
	    },
	    function(symbols, callback) {
	    	var newArray = reduceArray(symbols, 100);
	    	async.mapSeries(newArray, populateHistoricalData, function(err, result) {
	    		if (err) {
	    			console.log("Inserting histroical data failed: ", err);
	    		}
	    	});
	    }
	]);
};

