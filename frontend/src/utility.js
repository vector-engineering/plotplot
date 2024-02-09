import chroma from 'chroma-js';

/**
 * @description function meant to limit the amount of times a function is called in a given set of time.
 * @param {function} callback - function to throttle
 * @param {number} limit - Mininum time between calls in ms
 * @return {function} - Returns the throttled Function.
*/
export function throttle(callback, limit) {
    let wait = false;
    return function () {
        if (!wait) {
            callback.apply(null, arguments);
            wait = true;
            setTimeout(function () {
                wait = false;
            }, limit);
        }
    }
}

/**
 * @description Formats numbers as 1K (M,G,T, etc...) when above 3 digits. From: https://stackoverflow.com/a/9462382/730138
 * @param {number} num - The number to format
 * @param {number} digits - The number of decimal places to round the formatted string to (defaults to 1)
*/
export const nFormatter = (num, digits) => {
    const lookup = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "M" },
        { value: 1e9, symbol: "G" },
        { value: 1e12, symbol: "T" },
        { value: 1e15, symbol: "P" },
        { value: 1e18, symbol: "E" }
    ];
    //const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var item = lookup.slice().reverse().find(function (item) {
        return num >= item.value;
    });
    if (!item || !item.symbol) {
        return num
    }
    if (digits == null && item.symbol == "M" && parseFloat(num) < 1e7) {
        digits = 1
    }
    return item ? (parseFloat(num) / item.value).toFixed(digits) + item.symbol : "0";
};

/**
 * @description Transforms a regex statment into a simpler form. From: https://stackoverflow.com/a/32402438/730138
 * @param {string} str - String to be matched
 * @param {string} rule - REGEX Rule to be simplified
 * @returns {boolean} - True if there is a match, false otherwise.
 */
function matchRule(str, rule) {
    // for this solution to work on any string, no matter what characters it has
    var escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");

    // "."  => Find a single character, except newline or line terminator
    // ".*" => Matches any string that contains zero or more characters
    rule = rule.split("*").map(escapeRegex).join(".*");

    // "^"  => Matches any string with the following at the beginning of it
    // "$"  => Matches any string with that in front at the end of it
    //rule = "^" + rule + "$"

    //Create a regular expression object for matching string
    var regex = new RegExp(rule);

    //Returns true if it finds a match, otherwise it returns false
    return regex.test(str);
}

/**
 * @description Transforms a regex statment into a simpler form. IGNORES CASE.
 * @param {string} str - String to be matched
 * @param {string} rule - REGEX Rule
 * @returns {boolean} - True if there is a match, false otherwise.
 */
export function matchesSearch(str, rule) {
    if (rule.includes('*')) {
        return matchRule(str.toLowerCase(), rule.toLowerCase())
    }
    return str.toLowerCase().includes(rule.toLowerCase())
}

/**
 * Check if the new name is already contained in the list of keys, ignoring the old name.
 * @param {str[]} allKeys - String Array of current keys
 * @param {*} old_name - previous name
 * @param {*} new_name - new name
 * @returns - True if there are no similarly named keys, false if there is.
 */
export function validateName(allKeys, old_name, new_name) {
    for (let i = 0; i < allKeys.length; i++) {
        if (allKeys[i] == new_name && new_name != old_name) {
            return false
        }
    }
    return true;
}

export function dotStyle(color, size, outline) {
    return {
        alignItems: 'center',
        height: size,
        width: size,
        backgroundColor: color,
        borderRadius: '50%',
        display: 'inline-block',
        borderWidth: outline,
        borderStyle: 'solid',
        borderColor: 'white',
    }
}

export function getUiSizeFromMarkerSize(marker_size) {
    const s = marker_size * 4
    return '${s}px'
}

// From: https://stackoverflow.com/a/1573141/730138
export function colorNameToHex(color)
{
    var colors = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
    "beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887",
    "cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff",
    "darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f",
    "darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkturquoise":"#00ced1",
    "darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dodgerblue":"#1e90ff",
    "firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff",
    "gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520","gray":"#808080","green":"#008000","greenyellow":"#adff2f",
    "honeydew":"#f0fff0","hotpink":"#ff69b4",
    "indianred ":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c",
    "lavender":"#e6e6fa","lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2",
    "lightgrey":"#d3d3d3","lightgreen":"#90ee90","lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightsteelblue":"#b0c4de",
    "lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6",
    "magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee",
    "mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970","mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5",
    "navajowhite":"#ffdead","navy":"#000080",
    "oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6",
    "palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093","papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080",
    "rebeccapurple":"#663399","red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1",
    "saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4",
    "tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0",
    "violet":"#ee82ee",
    "wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5",
    "yellow":"#ffff00","yellowgreen":"#9acd32"};

    if (typeof colors[color.toLowerCase()] == 'undefined') {
        // Check for a hex value.
        console.log(color.charAt(0))
        if (color.charAt(0) == '#') {
            if (color.length == 7) {
                return color.toLowerCase() + 'FF';
            } else {
                return color;
            }
        } else {
            return null;
        }
    }

    return colors[color.toLowerCase()];
}

export function makeNameUnique(subsets, name, use_parenthesis = true, initial_name = null) {
    let is_unique = false
    let num = 2
    let query_name = name
    if (initial_name != null) {
        query_name = initial_name
    }
    while (!is_unique) {
        is_unique = true
        for (let [id, subset] of Object.entries(subsets)) {
            if (subset['name'] == query_name) {
                is_unique = false
                break
            }
        }
        if (!is_unique) {
            if (use_parenthesis) {
                query_name = name + ' (' + num.toString() + ')'
            } else {
                query_name = name + num.toString()
            }
        }
        num++
    }
    return query_name
}

export function chromaNoException(color, defaultColor = '#000000') {
    let this_color = chroma(defaultColor)
    try {
        this_color = chroma(color)
    } catch (exception) {
        // nothing.
    }
    return this_color
}

export function generatePlotKey() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

export function downloadWithFakeClick(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}
