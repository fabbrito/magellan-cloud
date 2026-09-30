# Grafana

Grafana reads the API worker through the
[Infinity](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/) datasource. The
cloud neither hosts nor configures Grafana (`docs/adr/0006-the-client-owns-presentation.md`): this
is how one connects, not a deployment.

Checked against Infinity 4.0.0, which needs Grafana 11.6.11, 12.0.10, 12.1.7, 12.2.5 or later in its
line; running on Grafana 13.2.3.

## The read API

GET only, `Authorization: Bearer <client token>`, every body a flat array of rows. The OpenAPI
document is `packages/query/openapi.json`.

| Route                             | Rows                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| `/v1/devices`                     | `id`, `description`, `revoked_at`                                |
| `/v1/devices/{id}/metrics`        | `source`, `metric`, `kind`, and the kind's `unit`, `exponent`, … |
| `/v1/devices/{id}/latest`         | each metric's newest value within a day, or null                 |
| `/v1/devices/{id}/health`         | one row: `last_heard`, `seq_gaps`, the heartbeat fields          |
| `/v1/devices/{id}/health/sources` | `source`, `last_heard`: when the device last read each           |
| `/v1/devices/{id}/series`         | `time`, `source`, `metric`, `value`, ascending by time           |

`series` takes `metric` (comma-separated `source:metric`, up to 20), `from` and `to` (both or
neither; epoch ms or RFC 3339; neither is the last day) and `rollup` (`reading`, `hour`, `day`).
Without `rollup` the range picks one: up to 2 days by reading, up to 90 by hour, past that by day.
Hours and days are cut in the device's zone; a bucket's `time` is its start.

A value is the physical quantity, as read: a gauge's is averaged over a bucket, a counter's and a
state's is the bucket's last. Nothing is derived from adjacent readings, so a lost reading is a
missing point.

## Token

One client token per Grafana, minted by the maintainer and printed once:

```bash
make register-client ID=grafana DESCRIPTION='Grafana'
make revoke-client ID=grafana   # it stops resolving at once
```

A client token reads every device and writes nothing.

## Install

Pin the plugin, installed before Grafana starts so provisioning finds it:

```bash
GF_PLUGINS_PREINSTALL_SYNC=yesoreyeram-infinity-datasource@4.0.0
```

`GF_INSTALL_PLUGINS` is deprecated, though Infinity's own install page still shows it.

## Datasource

Provisioned:

```yaml
apiVersion: 1
datasources:
  - name: Magellan
    uid: magellan
    type: yesoreyeram-infinity-datasource
    url: https://magellan-api.<subdomain>.workers.dev
    jsonData:
      auth_method: bearerToken
      allowedHosts:
        - https://magellan-api.<subdomain>.workers.dev
      timeoutInSeconds: 60
    secureJsonData:
      bearerToken: $MAGELLAN_CLIENT_TOKEN
```

Or by hand: Connections › Data sources › Infinity; Base URL; Authentication › Bearer token; the host
again under Allowed hosts.

- `uid` is what dashboard JSON refers to the datasource by. Left out, each fresh install mints a
  random one and exported dashboards break.
- `url` has no trailing slash: a query's path is appended to it as a string, so paths start `/v1`.
- An allowed host is a prefix of the full URL, scheme included.
- Save & test proves neither the URL nor the token unless the custom health check is on. Point it at
  `/v1/devices`.

## Queries

Every query: Type JSON, Parser JSONata, Source URL, Method GET. JSONata is Infinity's backend
parser, the one alerting runs; the frontend parsers do not alert. Declare the columns — without them
the time field can go undetected and a panel shows no data.

### Variables

`device`, from `/v1/devices`: column `id` (String), used as value and text.

`metric`, from `/v1/devices/${device}/metrics`, multi-value: a computed column `ref` with selector
`source + ':' + metric`, used as value and text.

### Series

A time series panel:

| Field   | Value                                                                      |
| ------- | -------------------------------------------------------------------------- |
| URL     | `/v1/devices/${device}/series`                                             |
| Params  | `metric` = `${metric:csv}`, `from` = `${__timeFrom}`, `to` = `${__timeTo}` |
| Format  | Time series                                                                |
| Columns | `time` Timestamp, `source` String, `metric` String, `value` Number         |

- `${metric:csv}`, never bare `$metric`, which Infinity interpolates as a glob, `{a,b}`.
- `${__timeFrom}` and `${__timeTo}` are epoch ms, interpolated in the backend, so an alert reads the
  same range. Infinity filters nothing by time; the API's `from` and `to` are the only filter.
- The rows are long: `source` and `metric` are string columns, so the time series format splits them
  into one series per metric, labelled by both. It only splits a table whose times ascend.
- Leave `rollup` out and the range chooses. To force one, `rollup` = `hour`; there is no
  `$__interval` in the backend, but `$__customInterval` picks by the range's length.

### Latest and health

A table or stat panel over `/v1/devices/${device}/latest` (the series columns, Format Table), and
one over `/v1/devices/${device}/health` (`last_heard` Timestamp, `seq_gaps` Number, and whichever
heartbeat fields it shows). `/health/sources` is the device's side of the same question, one row a
source; alerting on either is the client's (`docs/adr/0006-the-client-owns-presentation.md`).

## Presentation

The API answers values, never how they look.

- **Units** are on `/metrics`, not on a value row; set them per panel.
- **A state** is an integer code. Its labels are the metric's `state_labels` on `/metrics`; map them
  with a value mapping (Value type, one per code).
- **A counter** answers its raw running value. Show it as a number, a stat panel over `/latest`;
  chart the gauge that measures the same thing, power rather than energy.

## Refusals

Infinity fails a panel on any status past 399 as `unsuccessful HTTP response code` with the status,
and does not read the body. The reason is the problem's `title`, read with curl:

```bash
curl -sS -H "authorization: Bearer $TOKEN" "$API/v1/devices/<id>/series?metric=<source:metric>"
```

| Status | Why                                              | Do                                    |
| ------ | ------------------------------------------------ | ------------------------------------- |
| 400    | malformed parameter                              | check `metric`, `from`, `to`          |
| 401    | no token, or one revoked                         | the datasource's token                |
| 404    | no such device, or no metric declared            | the variables                         |
| 422    | past 10k readings or rows, or too many manifests | narrow the range, or coarser `rollup` |
