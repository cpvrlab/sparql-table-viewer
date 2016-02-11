(function ($) {

    function DataLoader(endPoint, pageSize, preLoadExtent) {
        var totalCount = 40;
        var data = { length: 0 }; // the data rows, which we'll fill in, plus an extra property for total length
        var pagesToLoad = {};
        var columns = [];
        var filters = []; // {column: "pollutant", comperator: "=", literal: "O3"} 
        var filterRequestStatus = {};
        var distinctValues = {}; // distinct column values: { "station" : ["Aarau", "Aargau"], ... }
        var dataXHR = [];
        var countXHR = null;

        // test dsd query
        queryDataStructureDefinition();

        
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
        var onErrorOccurred = new Slick.Event();

        function clearData() {
            for (var key in data) {
                delete data[key];
            }
            data.length = totalCount;
            pagesToLoad = {};

            // abort all running xhr requests for data
            abortAllDataRequests();
        }

        function clearColumns() {
            columns = [];
        }
        

        // load data cube definition
        function queryDataStructureDefinition(success) {
            /*var query = "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>"
            + "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>"
            + "PREFIX u28: <http://environment.data.admin.ch/ubd/28/>"
            + "PREFIX qb: <http://purl.org/linked-data/cube#>"
            + "SELECT * WHERE { "
            + "?dataset a qb:DataSet."
            + "?dataset rdfs:label ?datasetname."
            + "?dataset rdfs:comment ?datasetcomment."
            + "?dataset qb:structure ?structure."
            + "}"; */
/*
            var query = "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>" + 
            "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>" + 
            "PREFIX u28: <http://environment.data.admin.ch/ubd/28/>" + 
            "PREFIX qb: <http://purl.org/linked-data/cube#>" + 
            "SELECT * WHERE {" + 
            "?s a qb:DataStructureDefinition ;" + 
            "?p ?o ." + 
            "?o ?x ?y." + 
            "BIND(SUBSTR(xsd:string(?y),20) AS ?column) " + 
            "}";/**/

            var query = "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>" + 
            "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>" + 
            "PREFIX u28: <http://environment.data.admin.ch/ubd/28/>" + 
            "PREFIX qb: <http://purl.org/linked-data/cube#>" + 
            "SELECT * WHERE {" + 
            "?s a qb:DataStructureDefinition ;" + 
            "?p ?o ." + 
            "?o ?x ?y." +
            "?y rdfs:label ?l" + 
            "}";

            // get labels out of ?l 
            // find a way to get the exact types out of 

            // load dsd and build our query
            var req = $.ajax({
                dataType: "json",
                type: "POST",
                data: { query: query },
                url: endPoint,
                callbackParameter: "callback",
                Accept: "application/sparql-results+json",
                cache: true,
                success: function (resp, textStatus, jqXHR) {
                    console.log("DSD QUERY RESPONSE:\n");
                    console.log(JSON.stringify(resp.results.bindings));


                    var newQuery = "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n" +
                    "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n" +
                    "PREFIX u28: <http://environment.data.admin.ch/ubd/28/>\n" +
                    "\n";

                    // add column selectors
                    newQuery += "SELECT ";
                    for(var i in resp.results.bindings)   
                        newQuery += "?" + resp.results.bindings[i].l.value + " "; // todo: careful, if more than one language this part will fail!
                    newQuery += " WHERE {\n";

                    for(i in resp.results.bindings)  {

                        console.log(JSON.stringify(resp.results.bindings[i]));
                        // if dimension then look for label and filter language
                        // if attribute
                        console.log(resp.results.bindings[i].x.value);
                        if(false && resp.results.bindings[i].x.value != "http://purl.org/linked-data/cube#measure") {
                            newQuery += "?m <" + resp.results.bindings[i].y.value + "> ?" + resp.results.bindings[i].l.value + "Temp.\n" +
                            "?" + resp.results.bindings[i].l.value + "Temp rdfs:label ?" + resp.results.bindings[i].l.value + ".\n" +
                            "FILTER (lang(?" + resp.results.bindings[i].l.value + ") = 'de')\n";
                        }
                        else
                        {
                            newQuery += "?m <" + resp.results.bindings[i].y.value + "> ?" + resp.results.bindings[i].l.value + ".\n";
                        }

                    }
                    newQuery += "}";

                    setQuery(newQuery);
                    ensureData(0, 1000);

                    console.log("\nGENERATED QUERY: \n\n" + newQuery);
                },
                error: function () {
                    console.log("couldn't load dsd");
                }
            });

            /* goal query

            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX u28: <http://environment.data.admin.ch/ubd/28/>

            SELECT ?station ?pollutant ?aggregation ?year  ?measurement ?unit WHERE {
                ?m a <http://example.org/Measurement> .
                ?m <http://example.org/measurement> ?measurement.
                
                ?m <http://example.org/aggregation> ?a.
                ?a  rdfs:label ?aggregation.
                FILTER (lang(?aggregation) = 'de')

                ?m <http://example.org/station> ?s.
                ?s rdfs:label ?station.

                ?m <http://example.org/unit> ?u.
                ?u rdfs:label ?unit.
                FILTER (lang(?unit) = 'de')

                ?m <http://example.org/pollutant> ?p.
                ?p rdfs:label ?pollutant.
                FILTER (lang(?pollutant) = 'de')

                ?m <http://example.org/year> ?y
                BIND(SUBSTR(xsd:string(?y),46) AS ?year)
            }
            */

        }

        // from and to are 0-based row indices.
        function ensureData(from, to) {
            if (totalCount <= 0)
                return;

            data.length = totalCount;

            from -= preLoadExtent;
            to += preLoadExtent;

            // clamp from 0 to data.length - 1
            from = Math.min(Math.max(from, 0), data.length - 1);
            to = Math.min(Math.max(to, 0), data.length - 1);

            var fromPage = Math.floor(from / pageSize);
            var toPage = Math.floor(to / pageSize);

            //console.log("ensure data " + from + " " + to);

            for (var page = fromPage; page <= toPage; page++) {
                if (pagesToLoad[page] === undefined) {
                    pagesToLoad[page] = null;
                }
            }

            // do a bunch of queries to get the data for the range.
            // todo: remove this batching code, it doesn't do anything at the moment
            //       and if it did it wouldn't work properly because
            //       we added that abort code. It only works because we only load
            //       one page at a time
            for (page = fromPage; page <= toPage; page++) {
                if (pagesToLoad[page] === null) {
                    onDataLoading.notify({ from: from, to: to });
                    setLimit(page, pageSize);
                    loaderFunction.call(this, page);
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
            sparqlQuery.query = query;
                
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

        function abortAllDataRequests()
        {
            for(var i in dataXHR)
            {
                dataXHR[i].abort();
            }

            dataXHR = [];

            // console.log("ABORTED ALL DATA REQUESTS!");
        }

        /** Adds a new comparison filter to this loader. 
        @param  filterObj   ex.: {station: [], measurement: [], ... }
        */
        function setFilters(filters)
        {
            // we can optimize our filter query based on the selected amount
            // of sort values.
            // if only one value is selected we can just add FILTER(?column = "value")
            // if all but one value is selected we can use FILTER(?column != "value")

            

            sparqlQuery.filters = {};
            $.each(filters, function (column, filterValues) {

                // continue if the filter has everything selected
                // or is not loaded at all
                if (typeof distinctValues[column] === 'undefined' || 
                    filterValues.selectedLength == distinctValues[column].length) {
                    return true;
                }

                var lessSelectedValues = true;
                // note: special case for 0 selected elements, then we force
                //       a filter that looks like this FILTER(?column != "value" || ...)
                //       so that we recieve a 0 result. 
                // todo:    I'm unsure if we really need this since it is clear that 
                //          we'll recieve a count of 0 and there will be nothing to 
                //          display. I'll leave it in for now.
                //          The other option would be to ignore the filter but that would
                //          be strange behaviour..., so we'll leave it here I guess.
                if (0.5 * distinctValues[column].length < filterValues.selectedLength || 
                    filterValues.selectedLength === 0) {
                    lessSelectedValues = false;
                }
                sparqlQuery.filters[column] = sparqlQuery.filters[column] || "";
                sparqlQuery.filters[column] += "FILTER(";

                var filterCounter = 0;
                $.each(filterValues.values, function (i, val) {
                    // skip if we don't need the current value for our filter
                    if (lessSelectedValues && !val.isSelected ||
                        !lessSelectedValues && val.isSelected)
                        return true;

                    // default connector and comperator if we're using unchecked values
                    // then we want to filter with these two
                    var connector = " && ";
                    var comperator = " != ";
                    var isLastElement = filterCounter == (filterValues.values.length - filterValues.selectedLength - 1);
                    if (lessSelectedValues) {
                        // if however there are less selected values than unchecked ones
                        // then we want to use the selected values for filtering
                        connector = " || ";
                        comperator = " = ";
                        isLastElement = filterCounter == (filterValues.selectedLength - 1);
                    }
                    
                    sparqlQuery.filters[column] +=
                        "STR(?" + column + ")" + comperator + "\"" + val.value + "\"";

                    if (!isLastElement)
                        sparqlQuery.filters[column] += connector;

                    filterCounter++;
                });

                sparqlQuery.filters[column] += ")\n";
            });                      
        }

        function requestFilterData(columnId)
        {
            //console.log("requested filters for " + columnId);
            var queryObject = {
                outerSelect: "SELECT DISTINCT(?" + columnId + ") WHERE",
                orderBy: "ORDER BY ASC(?" + columnId + ")"
            };

            var queryString = compileSparqlQuery({ useLimit: false, useFilters: true, excludeFilterColumns: [columnId] }, queryObject);
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
                        vals.push(binding[columnId].value);
                    });

                    // update our local version of distinct values for this col
                    distinctValues[columnId] = vals;

                    onFilterValuesRetrieved.notify({ column: columnId, values: vals });
                },
                error: function () {
                    onErrorOccurred.notify({ msg: "Can't reach the server." });
                    console.log("error retrieving filter values");
                }
            });
        }

        function updateTotalCount(complete)
        {
            if (countXHR && countXHR.readystate != 4) {
                countXHR.abort();
                //console.log("Aborted previous count request.");
            }
            //console.log("Sending new count request.");

            // todo: our event firing and exposing is a bit messy at the moment
            //       for example we expose this function 'updateTotalCount' to the user
            //       which is bad... mhhh k?
            //       oh yea, I'm also calling onDataLoading here to let the user
            //       know that we're doing something (counting rows) but it will get called
            //       again in a sec when the actual data is being loaded... good or bad?
            onDataLoading.notify();
            var queryString = compileSparqlQuery({ useLimit: false }, { outerSelect: "SELECT COUNT(*) as ?count WHERE" });
            countXHR = $.ajax({
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
                    totalCount = parseInt(resp.results.bindings[0].count.value);
                    data.length = totalCount;
                    //console.log("recieved count request answer: " + totalCount + " rows");

                    onRowCountChanged.notify({ count: totalCount });

                    if (complete)
                        complete();
                },
                error: function () {
                    onErrorOccurred.notify({ msg: "Can't reach the server." });
                    console.log("error retrieving count query results");
                }
            });
        }
        
        function compileSparqlQuery(options, queryObject)
        {
            // set default values
            if (typeof options === 'undefined')
                options = {};
            if (typeof queryObject == 'undefined')
                queryObject = {};
            
            options.useSort = options.useSort !== false;
            options.useLimit = options.useLimit !== false;
            options.useFilters = options.useFilters !== false;
            options.excludeFilterColumns = options.excludeFilterColumns || [];

            queryObject.prologue = queryObject.prologue || sparqlQuery.prologue;
            queryObject.outerSelect = queryObject.outerSelect || sparqlQuery.outerSelect;
            queryObject.query = queryObject.query || sparqlQuery.query;
            queryObject.orderBy = queryObject.orderBy || sparqlQuery.orderBy;
            queryObject.filters = queryObject.filters || sparqlQuery.filters;
            queryObject.limit = queryObject.limit || sparqlQuery.limit;
            
            // check if we need limit, orderby or filters
            if (!options.useLimit)
                queryObject.limit = "";
            if (!options.useSort)
                queryObject.orderBy = "";

            var finalFilterString = "";
            if(options.useFilters) {
                // build final filter query
                for(var column in queryObject.filters)
                {
                    //console.log("options.excludeFilterColumns");
                    //console.log(options.excludeFilterColumns);
                    // if the exclude doesn't exists for the current column, add it
                    // to the final filter string
                    if (options.excludeFilterColumns.indexOf(column) == -1) {
                        finalFilterString += "#filters for " + 
                        column + "\n" + queryObject.filters[column] + "\n";
                    }
                    else {
                        //console.log("EXCLUDING A COLUMN");
                    }
                }
            }

            // build final query
            var queryString =
                queryObject.prologue +
                queryObject.outerSelect +
                "\n{\n{" + // inner filter block START
                queryObject.query +
                queryObject.orderBy +
                "\n}\n" + // inner filter block END
                finalFilterString +
                "}\n" + // outer select block END
                queryObject.limit;

            return queryString;
        }
        
        function compileQueryURL(options, queryObject) {
            var result = endPoint + "?query=" + encodeURIComponent(compileSparqlQuery(options, queryObject));
            return result;
        }
        
        function loaderFunction(page) {

            //console.log("Sending new data request.");

            // our sparql pages are 1-based.
            var queryString = compileSparqlQuery();
            var sparqlPage = page + 1;
            var xhr = $.ajax({
                dataType: 'json',
                type: 'POST',
                data: { query: queryString },
                url: endPoint,
                callbackParameter: "callback",
                Accept: 'application/sparql-results+json',
                cache: true,
                success: ajaxSuccess,
                error: function () {
                    onErrorOccurred.notify({ msg: "Can't reach the server." });
                    console.log('error loading page ' + page.toString());
                }
            });
            xhr.page = page;
            dataXHR.push(xhr);
        }

        function ajaxSuccess(responseData, textStatus, jqXHR) {
            //console.log("recieved data request answer.");

            // remove xhr from the dataXHR array
            dataXHR = dataXHR.filter(function (elem) {
                return elem != jqXHR;
            });

            // set the columns if not already set.
            if (columns.length === 0) {
                var vars = responseData.head.vars;
                $.each(vars, function (i, col) {
                    columns.push({ id: col, name: col, field: col, sortable: true });
                    
                });
                onColumnsChanged.notify(columns);                
            }
            var page = jqXHR.page;
            var rowsData = [];
            var results = responseData.results.bindings;
            // go through the results, and make rows data.
            for (var i = 0; i < results.length; i++) {
                var resultsRow = null;
                resultsRow = {};
                for (var col in results[i]) {
                    resultsRow[col] = results[i][col].value;
                }
                rowsData.push(resultsRow);
            }
            // set the page of data against the loader.
            setPageOfData(jqXHR.page, rowsData);
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
            "requestFilterData": requestFilterData,

            // events
            "onDataLoading": onDataLoading,
            "onDataLoaded": onDataLoaded,
            "onColumnsChanged": onColumnsChanged,
            "onRowCountChanged": onRowCountChanged,
            "onFilterValuesRetrieved": onFilterValuesRetrieved,
            "onErrorOccurred": onErrorOccurred
        };
    }

    $.extend(true, window, { udb: { DataLoader: DataLoader } });
})(jQuery);
