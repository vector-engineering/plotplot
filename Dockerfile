# # Build step #0: build custom plotly to fix heatmap bug
# NOTE: this is commented out since the repo ships with this and it takes a long time to build.

# FROM node:16-buster as plotly-step
#
# # -- Custom build Plotly.js so we can load in a specific version of regl-scatter2d which fixes a slow-heatmap bug
# WORKDIR /
# RUN git clone --depth 1 --branch v2.26.2 https://github.com/plotly/plotly.js.git
# WORKDIR /plotly.js
# # Install dependencies using the cache mount feature
# RUN --mount=type=cache,target=/app/.npm \
#     npm install
#
# RUN --mount=type=cache,target=/app/.npm \
#     npm install regl-scatter2d@2.1.17
# RUN npm run build

# Build step #1: build the React front end
FROM node:18-alpine as build-step
ARG URL_PREFIX

WORKDIR /app

# If you ran the custom-plotly build from above.
# COPY --from=plotly-step /plotly.js/dist/plotly.min.js ./frontend/custom-plotly.js/plotly.min.js
#
# Otherwise:
COPY ./frontend/custom-plotly.js/plotly.min.js ./frontend/custom-plotly.js/plotly.min.js

ENV PATH /app/node_modules/.bin:$PATH

# RUN date
# RUN apk add -U tzdata
# ENV TZ America/New_York
# RUN date

COPY ./frontend/package.json ./frontend
RUN cd frontend && npm install

COPY ./frontend/custom-plotly.js/package.json ./frontend/custom-plotly.js/
RUN cd frontend && npm install ./custom-plotly.js/

COPY ./frontend/src ./frontend/src
COPY ./frontend/public ./frontend/public

ENV PUBLIC_URL=$URL_PREFIX
RUN cd frontend && npm run build


# Build step #2: build the API with the client as static files
FROM python:3.9
ARG URL_PREFIX

WORKDIR /app
COPY --from=build-step /app/frontend/build ./frontend/build

RUN mkdir ./plotplot
COPY plotplot/requirements.txt ./plotplot/

# Install dependencies using the cache mount feature
RUN pip install -r ./plotplot/requirements.txt
    
COPY ./plotplot ./plotplot

ENV FLASK_ENV production
ENV PYTHONUNBUFFERED TRUE

# Set the URL prefix, see https://dlukes.github.io/flask-wsgi-url-prefix.html#mwe
ENV SCRIPT_NAME $URL_PREFIX

EXPOSE 9042
WORKDIR /app
CMD ["gunicorn", "-b", ":9042", "-t", "200", "--log-level", "debug", "-w", "1", "--threads", "10", "plotplot.backend:app"]
