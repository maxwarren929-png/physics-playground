!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.decomp=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f.exports,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
exports.decomp = polygonDecomp;
exports.quickDecomp = polygonQuickDecomp;
exports.isSimple = polygonIsSimple;
exports.removeCollinearPoints = polygonRemoveCollinearPoints;
exports.removeDuplicatePoints = polygonRemoveDuplicatePoints;
exports.makeCCW = polygonMakeCCW;
exports.lineSegmentsIntersect = lineSegmentsIntersect;
exports.lineIntersect = lineInt;

function lineInt(l1,l2,precision){
    precision = precision || 0;
    var i = [0,0];
    var a1, b1, c1, a2, b2, c2, det;
    a1 = l1[1][1] - l1[0][1];
    b1 = l1[0][0] - l1[1][0];
    c1 = a1 * l1[0][0] + b1 * l1[0][1];
    a2 = l2[1][1] - l2[0][1];
    b2 = l2[0][0] - l2[1][0];
    c2 = a2 * l2[0][0] + b2 * l2[0][1];
    det = a1 * b2 - a2*b1;
    if (!scalar_eq(det, 0, precision)) {
        i[0] = (b2 * c1 - b1 * c2) / det;
        i[1] = (a1 * c2 - a2 * c1) / det;
    }
    return i;
}

function lineSegmentsIntersect(p1, p2, q1, q2){
    var dx = p2[0] - p1[0];
    var dy = p2[1] - p1[1];
    var da = q2[0] - q1[0];
    var db = q2[1] - q1[1];
    if((da*dy - db*dx) === 0) return false;
    var s = (dx * (q1[1] - p1[1]) + dy * (p1[0] - q1[0])) / (da * dy - db * dx);
    var t = (da * (p1[1] - q1[1]) + db * (q1[0] - p1[0])) / (db * dx - da * dy);
    return (s>=0 && s<=1 && t>=0 && t<=1);
}

function triangleArea(a,b,c){
    return (((b[0] - a[0])*(c[1] - a[1]))-((c[0] - a[0])*(b[1] - a[1])));
}
function isLeft(a,b,c){ return triangleArea(a,b,c) > 0; }
function isLeftOn(a,b,c) { return triangleArea(a, b, c) >= 0; }
function isRight(a,b,c) { return triangleArea(a, b, c) < 0; }
function isRightOn(a,b,c) { return triangleArea(a, b, c) <= 0; }

var tmpPoint1 = [], tmpPoint2 = [];

function collinear(a,b,c,thresholdAngle) {
    if(!thresholdAngle) return triangleArea(a, b, c) === 0;
    var ab = tmpPoint1, bc = tmpPoint2;
    ab[0] = b[0]-a[0]; ab[1] = b[1]-a[1];
    bc[0] = c[0]-b[0]; bc[1] = c[1]-b[1];
    var dot = ab[0]*bc[0] + ab[1]*bc[1];
    var magA = Math.sqrt(ab[0]*ab[0] + ab[1]*ab[1]);
    var magB = Math.sqrt(bc[0]*bc[0] + bc[1]*bc[1]);
    var angle = Math.acos(dot/(magA*magB));
    return angle < thresholdAngle;
}

function sqdist(a,b){
    var dx = b[0] - a[0], dy = b[1] - a[1];
    return dx*dx + dy*dy;
}

function polygonAt(polygon, i){
    var s = polygon.length;
    return polygon[i < 0 ? i % s + s : i % s];
}
function polygonClear(polygon){ polygon.length = 0; }
function polygonAppend(polygon, poly, from, to){
    for(var i=from; i<to; i++) polygon.push(poly[i]);
}

function polygonMakeCCW(polygon){
    var br = 0, v = polygon;
    for (var i = 1; i < polygon.length; ++i) {
        if (v[i][1] < v[br][1] || (v[i][1] === v[br][1] && v[i][0] > v[br][0])) br = i;
    }
    if (!isLeft(polygonAt(polygon, br - 1), polygonAt(polygon, br), polygonAt(polygon, br + 1))) {
        polygonReverse(polygon);
        return true;
    }
    return false;
}

function polygonReverse(polygon){
    var tmp = [], N = polygon.length;
    for(var i=0; i!==N; i++) tmp.push(polygon.pop());
    for(var i=0; i!==N; i++) polygon[i] = tmp[i];
}

function polygonIsReflex(polygon, i){
    return isRight(polygonAt(polygon, i - 1), polygonAt(polygon, i), polygonAt(polygon, i + 1));
}

var tmpLine1=[], tmpLine2=[];

function polygonCanSee(polygon, a,b) {
    var p, dist, l1=tmpLine1, l2=tmpLine2;
    if (isLeftOn(polygonAt(polygon, a + 1), polygonAt(polygon, a), polygonAt(polygon, b)) && isRightOn(polygonAt(polygon, a - 1), polygonAt(polygon, a), polygonAt(polygon, b))) return false;
    dist = sqdist(polygonAt(polygon, a), polygonAt(polygon, b));
    for (var i = 0; i !== polygon.length; ++i) {
        if ((i + 1) % polygon.length === a || i === a) continue;
        if (isLeftOn(polygonAt(polygon, a), polygonAt(polygon, b), polygonAt(polygon, i + 1)) && isRightOn(polygonAt(polygon, a), polygonAt(polygon, b), polygonAt(polygon, i))) {
            l1[0] = polygonAt(polygon, a);
            l1[1] = polygonAt(polygon, b);
            l2[0] = polygonAt(polygon, i);
            l2[1] = polygonAt(polygon, i + 1);
            p = lineInt(l1,l2);
            if (sqdist(polygonAt(polygon, a), p) < dist) return false;
        }
    }
    return true;
}

function polygonCanSee2(polygon, a,b) {
    for (var i = 0; i !== polygon.length; ++i) {
        if (i === a || i === b || (i + 1) % polygon.length === a || (i + 1) % polygon.length === b) continue;
        if( lineSegmentsIntersect(polygonAt(polygon, a), polygonAt(polygon, b), polygonAt(polygon, i), polygonAt(polygon, i+1)) ) return false;
    }
    return true;
}

function polygonCopy(polygon, i,j,targetPoly){
    var p = targetPoly || [];
    polygonClear(p);
    if (i < j) {
        for(var k=i; k<=j; k++) p.push(polygon[k]);
    } else {
        for(var k=0; k<=j; k++) p.push(polygon[k]);
        for(var k=i; k<polygon.length; k++) p.push(polygon[k]);
    }
    return p;
}

function polygonGetCutEdges(polygon) {
    var min=[], tmp1=[], tmp2=[], tmpPoly = [];
    var nDiags = Number.MAX_VALUE;
    for (var i = 0; i < polygon.length; ++i) {
        if (polygonIsReflex(polygon, i)) {
            for (var j = 0; j < polygon.length; ++j) {
                if (polygonCanSee(polygon, i, j)) {
                    tmp1 = polygonGetCutEdges(polygonCopy(polygon, i, j, tmpPoly));
                    tmp2 = polygonGetCutEdges(polygonCopy(polygon, j, i, tmpPoly));
                    for(var k=0; k<tmp2.length; k++) tmp1.push(tmp2[k]);
                    if (tmp1.length < nDiags) {
                        min = tmp1;
                        nDiags = tmp1.length;
                        min.push([polygonAt(polygon, i), polygonAt(polygon, j)]);
                    }
                }
            }
        }
    }
    return min;
}

function polygonDecomp(polygon){
    var edges = polygonGetCutEdges(polygon);
    if(edges.length > 0) return polygonSlice(polygon, edges);
    else return [polygon];
}

function polygonSlice(polygon, cutEdges){
    if(cutEdges.length === 0) return [polygon];
    if(cutEdges instanceof Array && cutEdges.length && cutEdges[0] instanceof Array && cutEdges[0].length===2 && cutEdges[0][0] instanceof Array){
        var polys = [polygon];
        for(var i=0; i<cutEdges.length; i++){
            var cutEdge = cutEdges[i];
            for(var j=0; j<polys.length; j++){
                var poly = polys[j];
                var result = polygonSlice(poly, cutEdge);
                if(result){
                    polys.splice(j,1);
                    polys.push(result[0],result[1]);
                    break;
                }
            }
        }
        return polys;
    } else {
        var cutEdge = cutEdges;
        var i = polygon.indexOf(cutEdge[0]);
        var j = polygon.indexOf(cutEdge[1]);
        if(i !== -1 && j !== -1){
            return [polygonCopy(polygon, i,j), polygonCopy(polygon, j,i)];
        } else {
            return false;
        }
    }
}

function polygonIsSimple(polygon){
    var path = polygon, i;
    for(i=0; i<path.length-1; i++){
        for(var j=0; j<i-1; j++){
            if(lineSegmentsIntersect(path[i], path[i+1], path[j], path[j+1] )) return false;
        }
    }
    for(i=1; i<path.length-2; i++){
        if(lineSegmentsIntersect(path[0], path[path.length-1], path[i], path[i+1] )) return false;
    }
    return true;
}

function getIntersectionPoint(p1, p2, q1, q2, delta){
    delta = delta || 0;
    var a1 = p2[1] - p1[1];
    var b1 = p1[0] - p2[0];
    var c1 = (a1 * p1[0]) + (b1 * p1[1]);
    var a2 = q2[1] - q1[1];
    var b2 = q1[0] - q2[0];
    var c2 = (a2 * q1[0]) + (b2 * q1[1]);
    var det = (a1 * b2) - (a2 * b1);
    if(!scalar_eq(det,0,delta)) return [((b2 * c1) - (b1 * c2)) / det, ((a1 * c2) - (a2 * c1)) / det];
    else return [0,0];
}

function polygonQuickDecomp(polygon, result,reflexVertices,steinerPoints,delta,maxlevel,level){
    maxlevel = maxlevel || 100;
    level = level || 0;
    delta = delta || 25;
    result = typeof(result)!=="undefined" ? result : [];
    reflexVertices = reflexVertices || [];
    steinerPoints = steinerPoints || [];
    var upperInt=[0,0], lowerInt=[0,0], p=[0,0];
    var upperDist=0, lowerDist=0, d=0, closestDist=0;
    var upperIndex=0, lowerIndex=0, closestIndex=0;
    var lowerPoly=[], upperPoly=[];
    var poly = polygon, v = polygon;
    if(v.length < 3) return result;
    level++;
    if(level > maxlevel){ console.warn("quickDecomp: max level ("+maxlevel+") reached."); return result; }
    for (var i = 0; i < polygon.length; ++i) {
        if (polygonIsReflex(poly, i)) {
            reflexVertices.push(poly[i]);
            upperDist = lowerDist = Number.MAX_VALUE;
            for (var j = 0; j < polygon.length; ++j) {
                if (isLeft(polygonAt(poly, i - 1), polygonAt(poly, i), polygonAt(poly, j)) && isRightOn(polygonAt(poly, i - 1), polygonAt(poly, i), polygonAt(poly, j - 1))) {
                    p = getIntersectionPoint(polygonAt(poly, i - 1), polygonAt(poly, i), polygonAt(poly, j), polygonAt(poly, j - 1));
                    if (isRight(polygonAt(poly, i + 1), polygonAt(poly, i), p)) {
                        d = sqdist(poly[i], p);
                        if (d < lowerDist) { lowerDist = d; lowerInt = p; lowerIndex = j; }
                    }
                }
                if (isLeft(polygonAt(poly, i + 1), polygonAt(poly, i), polygonAt(poly, j + 1)) && isRightOn(polygonAt(poly, i + 1), polygonAt(poly, i), polygonAt(poly, j))) {
                    p = getIntersectionPoint(polygonAt(poly, i + 1), polygonAt(poly, i), polygonAt(poly, j), polygonAt(poly, j + 1));
                    if (isLeft(polygonAt(poly, i - 1), polygonAt(poly, i), p)) {
                        d = sqdist(poly[i], p);
                        if (d < upperDist) { upperDist = d; upperInt = p; upperIndex = j; }
                    }
                }
            }
            if (lowerIndex === (upperIndex + 1) % polygon.length) {
                p[0] = (lowerInt[0] + upperInt[0]) / 2; p[1] = (lowerInt[1] + upperInt[1]) / 2;
                steinerPoints.push(p);
                if (i < upperIndex) {
                    polygonAppend(lowerPoly, poly, i, upperIndex+1); lowerPoly.push(p);
                    upperPoly.push(p);
                    if (lowerIndex !== 0) polygonAppend(upperPoly, poly,lowerIndex,poly.length);
                    polygonAppend(upperPoly, poly,0,i+1);
                } else {
                    if (i !== 0) polygonAppend(lowerPoly, poly,i,poly.length);
                    polygonAppend(lowerPoly, poly,0,upperIndex+1); lowerPoly.push(p);
                    upperPoly.push(p);
                    polygonAppend(upperPoly, poly,lowerIndex,i+1);
                }
            } else {
                if (lowerIndex > upperIndex) upperIndex += polygon.length;
                closestDist = Number.MAX_VALUE;
                if(upperIndex < lowerIndex) return result;
                for (var j = lowerIndex; j <= upperIndex; ++j) {
                    if (isLeftOn(polygonAt(poly, i - 1), polygonAt(poly, i), polygonAt(poly, j)) && isRightOn(polygonAt(poly, i + 1), polygonAt(poly, i), polygonAt(poly, j))) {
                        d = sqdist(polygonAt(poly, i), polygonAt(poly, j));
                        if (d < closestDist && polygonCanSee2(poly, i, j)) { closestDist = d; closestIndex = j % polygon.length; }
                    }
                }
                if (i < closestIndex) {
                    polygonAppend(lowerPoly, poly,i,closestIndex+1);
                    if (closestIndex !== 0) polygonAppend(upperPoly, poly,closestIndex,v.length);
                    polygonAppend(upperPoly, poly,0,i+1);
                } else {
                    if (i !== 0) polygonAppend(lowerPoly, poly,i,v.length);
                    polygonAppend(lowerPoly, poly,0,closestIndex+1);
                    polygonAppend(upperPoly, poly,closestIndex,i+1);
                }
            }
            if (lowerPoly.length < upperPoly.length) {
                polygonQuickDecomp(lowerPoly,result,reflexVertices,steinerPoints,delta,maxlevel,level);
                polygonQuickDecomp(upperPoly,result,reflexVertices,steinerPoints,delta,maxlevel,level);
            } else {
                polygonQuickDecomp(upperPoly,result,reflexVertices,steinerPoints,delta,maxlevel,level);
                polygonQuickDecomp(lowerPoly,result,reflexVertices,steinerPoints,delta,maxlevel,level);
            }
            return result;
        }
    }
    result.push(polygon);
    return result;
}

function polygonRemoveCollinearPoints(polygon, precision){
    var num = 0;
    for(var i=polygon.length-1; polygon.length>3 && i>=0; --i){
        if(collinear(polygonAt(polygon, i-1),polygonAt(polygon, i),polygonAt(polygon, i+1),precision)){
            polygon.splice(i%polygon.length,1);
            num++;
        }
    }
    return num;
}

function polygonRemoveDuplicatePoints(polygon, precision){
    for(var i=polygon.length-1; i>=1; --i){
        var pi = polygon[i];
        for(var j=i-1; j>=0; --j){
            if(points_eq(pi, polygon[j], precision)){ polygon.splice(i,1); continue; }
        }
    }
}

function scalar_eq(a,b,precision){ precision = precision || 0; return Math.abs(a-b) <= precision; }
function points_eq(a,b,precision){ return scalar_eq(a[0],b[0],precision) && scalar_eq(a[1],b[1],precision); }

},{}]},{},[1])
(1)
});
