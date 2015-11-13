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
        var filterRequestStatus = {};

        // temporary filter test data
        
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
        var onFilterValuesRetrieved = new Slick.Event();

        function clearData() {
            for (var key in data) {
                delete data[key];
            }
            data.length = totalCount;
            pagesToLoad = {};
        }

        function clearColumns() {
            columns = [];
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
        @param  filterObj   ex.: {station: [], measurement: [], ... }
        */
        function setFilters(filters)
        {
            sparqlQuery.filters = "";
            $.each(filters, function (column, filterValues) {

                sparqlQuery.filters += "FILTER(";

                $.each(filterValues, function (i, val) {
                    sparqlQuery.filters +=
                        "STR(?" + column + ") != \"" + val + "\"";

                    if (i < (filterValues.length - 1))
                        sparqlQuery.filters += " && ";
                });

                sparqlQuery.filters += ")\n";
            });                      
        }


        function updateFilterValues()
        {
            $.each(columns, function (i, col) {
                col.id;
                filterRequestStatus[col.id] = false;

                var queryObject = {
                    outerSelect: "SELECT DISTINCT(?" + col.id + ") WHERE",
                    orderBy: "ORDER BY ASC(?" + col.id + ")"
                };

                var queryString = compileSparqlQuery({ useLimit: false }, queryObject);
                var req = $.ajax({
                    dataType: "json",
                    type: "POST",
                    data: { query: queryString },
                    url: endPoint,
                    callbackParameter: "callback",
                    Accept: "application/sparql-results+json",
                    cache: true,
                    success: function (resp, textStatus, jqXHR) {
                        var vals = [];
                        $.each(resp.results.bindings, function (i, binding) {
                            vals.push(binding[col.id].value);
                        });

                        onFilterValuesRetrieved.notify({column: col.id, values: vals});
                    },
                    error: function () {
                        console.log("error retrieving filter values");
                    }
                });
            });
        }

        function updateTotalCount(complete)
        {
            var queryString = compileSparqlQuery({ useLimit: false }, { outerSelect: "SELECT COUNT(*) as ?count WHERE" });
            var req = $.ajax({
                dataType: "json",
                type: "POST",
                data: { query: queryString },
                url: endPoint,
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

        function compileSparqlQuery(options, queryObject)
        {
            // set default values
            if (typeof options === 'undefined')
                options = {};
            if (typeof queryObject == 'undefined')
                queryObject = {};

            options.useSort = defaultValue(options.useSort, true);
            options.useLimit = defaultValue(options.useLimit, true);
            options.useFilters = defaultValue(options.useFilters, true);

            queryObject.prologue = defaultValue(queryObject.prologue, sparqlQuery.prologue);
            queryObject.outerSelect = defaultValue(queryObject.outerSelect, sparqlQuery.outerSelect);
            queryObject.query = defaultValue(queryObject.query, sparqlQuery.query);
            queryObject.orderBy = defaultValue(queryObject.orderBy, sparqlQuery.orderBy);
            queryObject.filters = defaultValue(queryObject.filters, sparqlQuery.filters);
            queryObject.limit = defaultValue(queryObject.limit, sparqlQuery.limit);
            
            // check if we need limit, orderby or filters
            if (!options.useLimit)
                queryObject.limit = "";
            if (!options.useSort)
                queryObject.orderBy = "";
            if (!options.useFilters)
                queryObject.filters = "";

            // build final query
            var queryString =
                queryObject.prologue +
                queryObject.outerSelect +
                "\n{\n{" + // inner filter block START
                queryObject.query +
                queryObject.orderBy +
                "\n}\n" + // inner filter block END
                queryObject.filters +
                "}\n" + // outer select block END
                queryObject.limit;

            return queryString;
        }
        
        function compileQueryURL(options, queryObject) {
            var result = endPoint + "?query=" + encodeURIComponent(compileSparqlQuery(options, queryObject));
            return result;
        }
        
        function loaderFunction(page) {
            // our sparql pages are 1-based.
            var queryString = compileSparqlQuery();
            var sparqlPage = page + 1
            var req = $.ajax({
                dataType: 'json',
                type: 'POST',
                data: { query: queryString },
                url: endPoint,
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

                // update filters
                updateFilterValues();

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
            "clearColumns": clearColumns,
            "clearData": clearData,
            "ensureData": ensureData,
            "setPageOfData": setPageOfData,
            "setSort": setSort,
            "setQuery": setQuery,
            "setLimit": setLimit,
            "setFilters": setFilters,
            "compileQueryURL": compileQueryURL, // we temporarily expose this function to have the simple download functionality.
            "compileSparqlQuery": compileSparqlQuery,
            "updateTotalCount": updateTotalCount,

            // events
            "onDataLoading": onDataLoading,
            "onDataLoaded": onDataLoaded,
            "onColumnsChanged": onColumnsChanged,
            "onRowCountChanged": onRowCountChanged,
            "onFilterValuesRetrieved": onFilterValuesRetrieved
        };
    }

    $.extend(true, window, { udb: { DataLoader: DataLoader } });
})(jQuery);
