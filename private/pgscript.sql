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