(function ($) {

    function DataLoader(pageSize) {

        var self = this;
        var pageSize = pageSize;
        var totalCount = 40;
        var data = { length: 0 }; // the data rows, which we'll fill in, plus an extra property for total length
        var pagesToLoad = {};
        var columns = [];
        var endPoint = "http://test.lindas-data.ch/sparql";
        var filters = []; // {column: "pollutant", comperator: "=", literal: "O3"} 

        // temporary filter test data
        filters.push({ column: "year", comperator: ">", literal: "1990" });
        filters.push({ column: "year", comperator: "<", literal: "1993" });
        filters.push({ column: "station ", comperator: "=", literal: "Zürich-Kaserne" });
        //filters.push({ column: "station", comperator: "=", literal: "Zürich-Kaserne" });

        // bundle individual sparql query parts in an object for now
        var sparqlQuery = {
            prologue: "",
            outerSelect: "SELECT * WHERE",
            query: "",
            orderBy: "",
            filters: "",
            limit: ""
        };
        
        // events
        var onDataLoading = new Slick.Event();
        var onDataLoaded = new Slick.Event();
        var onColumnsChanged = new Slick.Event();
        var onRowCountChanged = new Slick.Event();

        function clear() {
            for (var key in data) {
                delete data[key];
            }
            data.length = totalCount;
            columns = [];
            pagesToLoad = {};
        }
        
        // from and to are 0-based row indices.
        function ensureData(from, to) {

            data.length = totalCount;

            if (from < 0) {
                from = 0;
            }
            if (to > data.length - 1) {
                to = data.length - 1;
            }

            var fromPage = Math.floor(from / pageSize);
            var toPage = Math.floor(to / pageSize);


            for (var page = fromPage; page <= toPage; page++) {
                if (pagesToLoad[page] == undefined) {
                    pagesToLoad[page] = null;
                }
            }

            // do a bunch of queries to get the data for the range.
            for (var page = fromPage; page <= toPage; page++) {
                if (pagesToLoad[page] == null) {
                    onDataLoading.notify({ from: from, to: to });
                    setLimit(page, pageSize);
                    loaderFunction.call(self, page);
                }
            }
        }

        // todo: can we reset the sort? 
        function setSort(field, sortAsc) {
            // todo: use a nicer way to set asc/desc here
            sparqlQuery.orderBy = "ORDER BY " + ((sortAsc) ? "ASC" : "DESC") + "(?" + field + ")";
        }

        function setQuery(query, complete) {
            // extract the prologue from the query (PREFIX|BASE)
            // probably better to change later to a sparql parser https://github.com/RubenVerborgh/SPARQL.js
            var re = /.*(PREFIX|BASE).*\n/g; 
            var prologue;
            sparqlQuery.prologue = "";
            sparqlQuery.query = query
                
            while ((prologue = re.exec(query)) !== null) {
                sparqlQuery.prologue += prologue[0] ;
                sparqlQuery.query = sparqlQuery.query.replace(prologue[0], '');
            }
            
            // make sure our total count is still correct
            updateTotalCount(complete);
        }

        function setLimit(page, limit) {
            sparqlQuery.limit = "LIMIT " + limit + " OFFSET " + (page * limit);
        }

        /** Adds a new comparison filter to this loader. 
        Note that we can only compare to literal values at the moment.

        @param  column      
        @param  comperator  string determining the comperator to use. (ex: >=)
        @param  literal     lietal value to compare to
        */
        function addFilter(column, comperator, literal)
        {
            filters.push({ "column": column, "comperator": comperator, "literal": literal });
        }

        function clearFilters()
        {
            filters = [];
        }

        function updateTotalCount(complete)
        {
            var url = compileCountQueryURL();
            var req = $.ajax({
                dataType: "json",
                type: "GET",
                url: url,
                callbackParameter: "callback",
                Accept: "application/sparql-results+json",
                cache: true,
                success: function (resp, textStatus, jqXHR) {
                    // the count query should always return with just one row and one column
                    // so our count result should be at 0 0
                    totalCount = parseInt(resp.results.bindings[0]["count"]["value"]);                    
                    data.length = totalCount;
                    console.log("counted " + totalCount + " rows");

                    onRowCountChanged.notify({ count: totalCount });

                    if (complete)
                        complete();
                },
                error: function () {
                    console.log("error retrieving count query results");
                }
            });
        }

        function defaultValue(variable, defaultVal)
        {
            variable = typeof variable !== 'undefined' ? variable : defaultVal;
            return variable;
        }

        // expects an object
        // {outerSelect: "SELECT * WHERE", 
        function compileSparqlQuery(options, queryObject)
        {
            if (typeof options === 'undefined')
                options = {}

            options.useSort = defaultValue(options.useSort, true);
            options.useLimit = defaultValue(options.useLimit, true);
            options.useFilters = defaultValue(options.useFilters, true);
            
            console.log("options: " + options.useFilters);

            queryObject = sparqlQuery;
            queryObject.prologue = defaultValue(queryObject.prologue, sparqlQuery.prologue);
            queryObject.outerSelect = defaultValue(queryObject.outerSelect, sparqlQuery.outerSelect);
            queryObject.query = defaultValue(queryObject.query, sparqlQuery.query);
            queryObject.orderBy = defaultValue(queryObject.orderBy, sparqlQuery.orderBy);
            queryObject.filters = defaultValue(queryObject.filters, sparqlQuery.filters);
            queryObject.limit = defaultValue(queryObject.limit, sparqlQuery.limit);
            

            var filterString = "";
            if (options.useFilters) {
                console.log(filters);
                $.each(filters, function (i, val) {
                    filterString += "FILTER(?" +
                        val.column + " " +
                        val.comperator + " " +
                        "\"" + val.literal + "\")\n";
                });
            }

            var queryString =
                queryObject.prologue +
                queryObject.outerSelect +
                "{{\n" + // inner filter block around the main select query
                queryObject.query +
                queryObject.orderBy +
                "}\n" + // inner filter block END
                filterString + // todo: replace with sparql query property
                "}\n" + // outer select block END
                queryObject.limit;

            console.log(queryString);

            return queryString;
        }
        
        function compileQueryURL(useSort, useLimit) {
            useSort = typeof useSort !== 'undefined' ? useSort : true;
            useLimit = typeof useLimit !== 'undefined' ? useLimit : true;

            var result = endPoint + "?query=" + encodeURIComponent(compileSparqlQuery(useSort, useLimit, true));
            return result;
        }

        function compileCountQueryURL() {
            var preCount = "SELECT COUNT(*) as ?count WHERE {";
            var postCount = "}\n"
            var queryString = sparqlQuery.prologue + preCount + sparqlQuery.query + postCount;

            var result = endPoint + "?query=" + encodeURIComponent(queryString);
            return result;
        }

        function loaderFunction(page) {
            // our sparql pages are 1-based.
            var sparqlPage = page + 1
            var url = compileQueryURL();
            var req = $.ajax({
                dataType: 'json',
                type: 'GET',
                url: url,
                callbackParameter: "callback",
                Accept: 'application/sparql-results+json',
                cache: true,
                success: ajaxSuccess,
                error: function () {
                    console.log('error loading page ' + page.toString());
                }
            });
            req.page = page;
        }

        function ajaxSuccess(responseData, textStatus, jqXHR) {
            // set the columns if not already set.
            if (columns.length == 0) {
                var vars = responseData["head"]["vars"];
                $.each(vars, function (i, col) {
                    columns.push({ id: col, name: col, field: col, sortable: true });
                });

                onColumnsChanged.notify(columns);
            }
            var page = jqXHR.page;
            var rowsData = [];
            var results = responseData["results"]["bindings"];
            // go through the results, and make rows data.
            for (var i = 0; i < results.length; i++) {
                var resultsRow = null;
                resultsRow = {};
                for (var col in results[i]) {
                    resultsRow[col] = results[i][col]["value"];
                }
                rowsData.push(resultsRow);
            }
            // set the page of data against the loader.
            loader.setPageOfData(jqXHR.page, rowsData);
        }

        // given a page index, and an array of row data, set the data for the page
        function setPageOfData(page, rows) {

            pagesToLoad[page] = true; // set the page as loaded.
            var noOfRows = rows.length;
            var thisPageFrom = page * pageSize;
            var thisPageTo = thisPageFrom + noOfRows - 1;

            // fill the results in in data.
            for (var i = 0; i < noOfRows; i++) {

                // assign the row of results;
                data[thisPageFrom + i] = rows[i];
            }
            onDataLoaded.notify({ from: thisPageFrom, to: thisPageTo });

        }

        // public api.
        return {
            // properties
            "data": data,
            "sparqlQuery": sparqlQuery,

            // methods
            "clear": clear,
            "ensureData": ensureData,
            "setPageOfData": setPageOfData,
            "setSort": setSort,
            "setQuery": setQuery,
            "setLimit": setLimit,
            "compileQueryURL": compileQueryURL, // we temporarily expose this function to have the simple download functionality.
            "compileCountQueryURL": compileCountQueryURL,
            "compileSparqlQuery": compileSparqlQuery, //temp

            // events
            "onDataLoading": onDataLoading,
            "onDataLoaded": onDataLoaded,
            "onColumnsChanged": onColumnsChanged,
            "onRowCountChanged": onRowCountChanged
        };
    }

    $.extend(true, window, { udb: { DataLoader: DataLoader } });
})(jQuery);
