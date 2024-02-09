class Polygon {
    constructor(a) {
        this.points = []
        this.lastPreviewPos = []
    }

    addPoint(pos) {
        this.points.push([pos[0], pos[1]])
    }

    removeLastPoint() {
        this.points.pop()
    }

    hasPoints() {
        return this.points.length > 0
    }

    getPoints() {
        return this.points
    }

    getPath(pathPoints) {
        // Convert the polygon into an SVG polygon string.
        let s = 'M'
        let first = true
        let end = ''
        for (let point of pathPoints) {
            if (first) {
                // Close the polygon
                first = false
                end = 'L' + point[0] + ',' + point[1]
            } else {
                s += 'L'
            }
            s += point[0] + ',' + point[1]
        }
        s += end

        return s
    }

    getShape(layout) {
        return this.getShapeHelper(this.getPath(this.points), this.getXref(layout), this.getYref(layout))
    }

    getXref(layout) {
        if (layout.hasOwnProperty('xaxis3')) {
            return 'x3'
        } else {
            return 'x'
        }
    }

    getYref(layout) {
        if (layout.hasOwnProperty('yaxis3')) {
            return 'y3'
        } else {
            return 'y'
        }
    }

    getShapeHelper(path, xref, yref) {
        let shape = {
            "line": {
                "color": "Black",
                "width": 3
            },
            "type": "path",
            "xref": xref,
            "yref": yref,
            "path": path,
            "fillcolor": "rgba(0, 0, 0, .1)"
            // fillrule: "evenodd"
            // layer: "above"
            // line: {color: '#444', width: 4, dash: 'solid'}
            // opacity: 1
        }
        return shape
    }

    getShapeWithPreview(pos, layout) {
        this.lastPreviewPos = pos
        let pathPoints = [...this.points]
        pathPoints.push(pos)
        let path = this.getPath(pathPoints)
        return this.getShapeHelper(path, this.getXref(layout), this.getYref(layout))
    }

    xyMinMax(pos = null) {
        let xmin = Infinity
        let xmax = -Infinity
        let ymin = Infinity
        let ymax = -Infinity

        for (let point of this.points) {
            xmin = Math.min(xmin, point[0])
            xmax = Math.max(xmax, point[0])

            ymin = Math.min(ymin, point[1])
            ymax = Math.max(ymax, point[1])
        }

        if (pos != null) {
            xmin = Math.min(xmin, pos[0])
            xmax = Math.max(xmax, pos[0])

            ymin = Math.min(ymin, pos[1])
            ymax = Math.max(ymax, pos[1])
        }
        return [xmin, xmax, ymin, ymax]
    }

}

export { Polygon };
