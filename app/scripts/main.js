/*jslint browser: true*/
/*jslint nomen: true*/
/*global $, _, d3*/

(function () {
    'use strict';

    var app,
        views,

        DATA_PATH = 'data/data.csv',

        MAX = 1500000,

        commasFormatter = d3.format(",.0f"),
        schoolCodeFormatter = d3.format("04d");

    $(function () {
        d3.csv(DATA_PATH, function (d) {
            return {
                name: d.SCHOOLNAME,
                code: schoolCodeFormatter(d.SCHOOLCODE),
                ward: d.WARD === '' ? null : d.WARD,
                level: d.LEVEL === '' ? null : d.LEVEL,
                enrollment: d.ENROLLMENT === '' ? null : +d.ENROLLMENT,
                atRiskCount: d.ATRISKCOUNT === '' ? null : +d.ATRISKCOUNT,
                atRiskFunds: d.ATRISKTOTAL === '' ? null : +d.ATRISKTOTAL
            };
        }, app.initialize);
    });

    app = {
        initialize: function (data) {
            $('#loading').fadeOut();
            $('#main').fadeIn();

            app.data = _.filter(data, 'atRiskCount');
            app.filterData({});

            app.loadView('Bubbles');

            $(window).resize(function () { app.view.resize(); });

            $('#views').change(function (e) {
                app.loadView($(e.target).attr('value'));
            });

            $('#filters').change(function () {
                var filter = {};
                $('#filters input:checked').each(function () {
                    var $el = $(this),
                        value = $el.attr('value');

                    if (value) { filter[$el.attr('name')] = value; }
                });

                app.filterData(filter);
            });
        },

        filterData: function (filter) {
            var data = _(app.data).forEach(function (school) {
                school.filtered = false;
            });

            if (!_.isEmpty(filter)) {
                data.reject(filter).forEach(function (school) {
                    school.filtered = true;
                });
            }

            if (app.view) { app.view.refresh(); }
        },

        loadView: function (view) {
            $('#exhibit').empty();
            app.view = new views[view](app.data);
        }
    };

    window.app = app;

    views = {};

    views.Bubbles = function (data) {
        this.margin = {top: 120, right: 20, bottom: 40, left: 60};
        this.data = data;
        this.$el = $('#exhibit');

        this.x = d3.scale.linear().domain([0, 600]);
        this.y = d3.scale.linear().domain([0, MAX]);

        this.svg = d3.select('#exhibit').append('svg')
            .attr("class", "bubble chart");
        this.g = this.svg.append('g')
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this.bg = this.g.append('g');
        this.fg = this.g.append('g');
        this.interactionLayer = this.g.append('g');

        this.resize();
    };

    views.Bubbles.prototype.resize = function () {
        var xAxis, yAxis,
            width = this.$el.width() - this.margin.left - this.margin.right,
            height = this.$el.height() - this.margin.top - this.margin.bottom,
            that = this;

        this.svg
            .attr("width", width + this.margin.left + this.margin.right)
            .attr("height", height + this.margin.top + this.margin.bottom);

        this.x.range([0, width]);
        this.y.range([height, 0]);

        xAxis = d3.svg.axis()
            .scale(this.x)
            .ticks(width > 800 ? 12 : 6)
            .tickSize(-height - 20)
            .orient("bottom");

        yAxis = d3.svg.axis()
            .scale(this.y)
            .tickValues([0, 250000, 500000, 750000, 1000000, 1250000, 1500000])
            .tickFormat(function (d) { return '$' + commasFormatter(d / 1000) + 'K'; })
            .tickSize(-width - 20)
            .orient("left");

        this.voronoi = d3.geom.voronoi()
            .x(function (d) { return that.x(d.atRiskCount); })
            .y(function (d) { return d.atRiskFunds > MAX ? -10 : that.y(d.atRiskFunds); })
            .clipExtent([[-20, -20],
                [width + 20, height + 20]]);

        this.bg.selectAll('.axis').remove();
        this.bg.selectAll('.guide').remove();

        this.bg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (height + 10) + ")")
            .call(xAxis)
            .append("text")
                .attr("class", "label")
                .attr("x", width - 5)
                .attr("y", -16)
                .style("text-anchor", "end")
                .text("# of At-Risk Students");

        this.bg.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(-10,0)")
            .call(yAxis)
            .append("text")
                .attr("class", "label")
                .attr("transform", "rotate(-90)")
                .attr("x", -4)
                .attr("y", 16)
                .attr("dy", ".71em")
                .style("text-anchor", "end")
                .text("Total At-Risk Funds");

        this.bg.append("line")
            .attr("class", "guide")
            .attr("x1", this.x(0))
            .attr("y1", this.y(0))
            .attr("x2", this.x(600))
            .attr("y2", this.y(1206375));

        this.refresh();
    };

    views.Bubbles.prototype.refresh = function () {
        var bubbles,
            voronoiPaths,
            that = this;

        bubbles = this.fg.selectAll('.bubble')
            .data(this.data);

        bubbles.enter().append('circle')
            .attr('class', function (d) { return 'bubble school-' + d.code; })
            .attr('r', 6)
            .attr('cy', this.y(0));

        bubbles.attr('cx', function (d) { return that.x(d.atRiskCount); })
            .transition()
            .ease('elastic')
            .duration(900)
            .delay(function (d) { return d.atRiskCount / 2 + Math.random() * 300; })
            .each('start', function () { d3.select(this).classed('disabled', function (d) { return d.filtered; }); })
            .attr('r', function (d) { return d.filtered ? 3 : 6; })
            .attr('cy', function (d) { return d.atRiskFunds > MAX ? -10 : that.y(d.atRiskFunds); });

        bubbles.exit().remove();

        voronoiPaths = this.interactionLayer.selectAll('.voronoi')
            .data(this.voronoi(_.reject(this.data, 'filtered')));

        voronoiPaths.enter().append('path')
            .attr('class', 'voronoi')
            .on("mouseover", function (d) { that.mouseover(d); })
            .on("mouseout", function (d) { that.mouseout(d); });

        voronoiPaths.attr("d", function (d) { return "M" + d.join("L") + "Z"; })
            .datum(function (d) { return d.point; });

        voronoiPaths.exit().remove();
    };

    views.Bubbles.prototype.mouseover = function (d) {
        this.fg.select('.bubble.school-' + d.code)
            .classed('highlighted', true)
            .transition()
            .ease('elastic')
            .duration(900)
            .attr('r', 18);

        $('#description .template h3').text(d.name);
        $('#enrollment').text(d.enrollment);
        $('#atriskcount').text(d.atRiskCount);
        $('#atriskpercent').text((d.atRiskCount / d.enrollment * 100).toFixed(1));
        $('#atriskfunds').text('$' + commasFormatter(d.atRiskFunds));
        $('#perstudentfunds').text('$' + commasFormatter(d.atRiskFunds / d.atRiskCount));

        $('#description .placeholder').hide();
        $('#description .template').show();
    };

    views.Bubbles.prototype.mouseout = function (d) {
        this.fg.select('.bubble.school-' + d.code)
            .classed('highlighted', false)
            .transition()
            .ease('elastic')
            .duration(900)
            .attr('r', 6);

        $('#description .placeholder').show();
        $('#description .template').hide();
    };

}());