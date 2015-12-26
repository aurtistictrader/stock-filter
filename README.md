# Stock-filter
Grabs and parses data using nasdaq and yahoo api. Information is stored in a database and this also does custom interactions and calculations.

# Details 
Currently hardcoded to do long term bottom up - with data from the last 5 yrs.
Uses Percentage Change From 200-day Moving Average to calculate current price feasibility.
Then checks for bull market signals within the last year, with the combination of a strong support over the last 5 years.

# Yahoo api details
https://greenido.wordpress.com/2009/12/22/yahoo-finance-hidden-api/

# License
The MIT License (MIT)

Copyright (c) 2015 Cheng Peng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
