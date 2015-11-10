(function ($) {

    function DataLoader(totalCount, pageSize) {

        var self = this;
        var pageSize = pageSize;
        var data = { length: 0 }; // the data rows, which we'll fill in, plus an extra property for total length
        var pagesToLoad = {};
        var columns = [];
        var endPoint = "http://test.lindas-data.ch/sparql";

        // bundle individual sparql query parts in an object for now
        var sparqlQuery = {
            query: "",
            orderBy: "",
            limit: ""
        };

        // events
        var onDataLoading = new Slick.Event();
        var onDataLoaded = new Slick.Event();
        var onPageLoading = new Slick.Event();
        var onPageLoaded = new Slick.Event();
        var onColumnsChanged = new Slick.Event();

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
                    console.log('loading a page');
                    onPageLoading.notify({ page: page });
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

        function setQuery(query) {
            sparqlQuery.query = query;
        }

        function setLimit(page, limit) {
            sparqlQuery.limit = "LIMIT " + limit + " OFFSET " + (page * limit);
        }

        function compileQueryURL() {
            var queryString = sparqlQuery.query + sparqlQuery.orderBy + sparqlQuery.limit;
            var result = endPoint + "?query=" + encodeURIComponent(queryString);
            console.log("building query: " + sparqlQuery.query);
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
            req.page = page; // ad a property onto teh jqXHR obj
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

            onPageLoaded.notify({ page: page });
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

            // events
            "onDataLoading": onDataLoading,
            "onDataLoaded": onDataLoaded,
            "onPageLoading": onPageLoading,
            "onPageLoaded": onPageLoaded,
            "onColumnsChanged": onColumnsChanged
        };
    }

    $.extend(true, window, { udb: { DataLoader: DataLoader } });
})(jQuery);