CREATE TABLE symbols(
	symbol  char(10) PRIMARY KEY
);

CREATE TABLE historical(
	symbol 		char(10) REFERENCES symbols,
	date 		date NOT NULL,
	open 		real NOT NULL,
	high 		real NOT NULL,
	low 		real NOT NULL,
	close 		real NOT NULL,
	adjClose 	real NOT NULL,
	volume 		integer NOT NULL
);

CREATE TABLE historical_wiki(
	symbol 		char(10),
	date 		date,
	open 		real,
	high 		real,
	low 		real,
	close 		real,
	volume 		integer,
	ex_dividend real,
	split_ratio real,
	adj_open 	real,
	adj_high 	real,
	adj_low  	real,
	adj_close 	real,
	adj_volume 	real
);

CREATE TABLE symbols_wiki(
	symbol  char(10)
);
INSERT INTO symbols_wiki
SELECT DISTINCT symbol FROM historical_wiki ORDER BY symbol ASC;