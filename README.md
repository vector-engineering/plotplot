# Plotplot
Drag and drop plotting, data selection, and filtering.

Developed by the [Deverman lab](https://vector.engineering).

## Main Features
 - Drag-and-drop to graph
 - "Google Maps style" pan-and-zoom controls
 - Scatter plots, heatmaps, histograms, and rank plots
 - Group data into multiple subsets
   - Refine, rename, and export subsets
 - Large data:
   - Millions of rows supported
     - Streaming of plot tiles for large plots
     - Automatic switching to density plots when plotting huge numbers of points
   - Thousands of columns
 - Polygon selection of points
 - Categorical filtering
 - Sequence filtering
 - Native NaN support
 - User accounts and sharing sessions (for server deployments)

## Screenshots

![Polygon and Z-axis variable selection](/docs/polygon-with-3rd-var.png?raw=true)
Polygon selection


![Drag and drop to make a plot](/docs/drag-drop.png?raw=true)
Drag and drop to make a plot

![Create subsets of data via polygon, string, or categorical selection](docs/color-shows-membership-and-3rd-variable.png?raw=true)
Create subsets of data via polygon, string, or categorical selection

![Filter on string columns](/docs/string-selection.png?raw=true)
Filter on string columns


## Supported files

- `.csv` files that are pivot tables (columns are measurements, rows are values):

| Sequence | Binding | Transduction |
| -------- | ------- | ------------ |
| SAQAQAQ  | 0.1     | 0.231        |
| TTTQQQA  | 5.12    | 4.1212       |
| AAATAAT  | 0.32    | 0.5423       |

or

| Month    | Savings |
| -------- | ------- |
| January  | 250     |
| February | 80      |
| March    | 450     |

- `.h5ad` files also have experimental support.  If you try them, please file any issues you experience.

# Installation
## On a single computer
You can install Plotplot from pip and run it yourself:
```
pip install plotplot
plotplot
```

## Configration
See `plotplot.ini` and `plotplot/plotplot_config.py` for list of configuration options.

## Deployment to a server
Plotplot works well on a high-powered server, espeically when colocated with your data.
 - Streams data to the user as needed (avoids large transfers if colocated with data)
 - Generate plots very quickly
 - Open large files when lots of RAM is available

A few features are specifically for shared systems:
 - Support for hot-linking from other tools directly into Plotplot
 - Share sessions among users
 - User authentication with Google accounts
 - User whitelist

To deploy on a server, use Docker.

### Step 1: Clone
```
git clone git@github.com:vector-engineering/plotplot.git
```

### Step 2: Build docker image
```
docker build -f Dockerfile -t plotplot .
```
Note: you can pass `--build-arg URL_PREFIX=/my-custom-plotplot` if you want to change the URL_PREFIX

### Step 3: Run docker image
```
# This will run on port 9042
docker run --restart=unless-stopped -p 0.0.0.0:9042:9042 -d plotplot
```
Then navigate to your-server.com:9042 and you should see plotplot.

### Step 4: Nginx / reverse proxy
A reverse proxy like Nginx is well supported.

Run with a Docker command like this:
```
docker run --restart=unless-stopped -p 127.0.0.1:9042:9042 -d plotplot
```

Example Nginx configuration:
```
	location = /plotplot/ {
		proxy_pass http://localhost:9042/plotplot/index.html;
		proxy_set_header Host $http_host;
		proxy_redirect default;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "upgrade";
		add_header xv-nginx-remote_user $remote_user;

	}

	location /plotplot/ {
		proxy_pass http://localhost:9042/plot/;
		proxy_set_header Host $http_host;
		proxy_redirect default;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "upgrade";
		add_header xv-nginx-remote_user $remote_user;
	}
```

# Development setup
Development is done with 2 processes:
1. React
2. Flask

This is so you can live-reload the frontend while working.

## Step 1: Clone repo
```
git clone git@github.com:vector-engineering/plotplot.git
```

## Step 2: Install React dependencies
```
cd frontend
npm install
```

## Step 3: Install Python dependencies
```
cd plotplot
pip install -r requirements.txt
```

## Step 4: Run frontend and backend
```
cd plotplot
flask run --no-debugger --cert=adhoc
```
```
# In a new terminal
cd frontend
npm start
```

# Creating the Python wheel
```
cd frontend
npm run build
cd ..
poetry build
```

# Building custom-plotly
Plotly has a bug that causes heatmaps with repeated values to be very slow.

The best way to generate this yourself is to use the Docker image that creates it on build.

## If you really want to do it yourself:
```
cd plotly.js

# I used node 18.18.0
npm install
npm install regl-scatter2d@2.1.17 # <--- this is the key step
npm run build

# Then copy the dist/plotly[.min].js file into ./custom-plotly.js
# then in this repo
cd ../plotplot
cp -r ../plotly.js/dist/plotly.min.js frontend/custom-plotly.js
npm install ./custom-plotly.js
```
