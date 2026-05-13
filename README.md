# MMM-FireflyBills

[MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module to display a list of bills from [Firefly III](https://www.firefly-iii.org/).

## Installation

```shell
cd ~/MagicMirror/modules
git clone https://github.com/angeldeejay/MMM-FireflyBills
cd MMM-FireflyBills
npm install
```

## Update

```shell
cd ~/MagicMirror/modules/MMM-FireflyBills
git pull
npm install
```

## Config example

Add this block to your `config/config.js`:

```js
{
  module: "MMM-FireflyBills",
  position: "top_right",
  config: {
    url: "http://your-firefly-server:8080",
    token: "your-personal-access-token",
    updateInterval: 15000,
    animationSpeed: 500
  }
},
```

## Config options

Except `url` all options are optional.

<!-- prettier-ignore-start -->
| **Option**     | **Description**                                                                                                                                                                                          |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| url            | Full URL of your Firefly III instance <br><br>**Default value:** `""`                                                                                                                                    |
| token          | Personal Access Token from Firefly III (Profile → OAuth → Personal Access Tokens) <br><br>**Default value:** `null`                                                                                     |
| noDataText     | Text shown when no data is available <br><br>**Default value:** `"No data"`                                                                                                                              |
| updateInterval | Milliseconds between refreshes <br><br>**Default value:** `15000`                                                                                                                                        |
| animationSpeed | Speed of the update animation in milliseconds. Set to `0` to disable blinking.<br><br>**Default value:** `500`<br> **Possible values:** `0` - `5000`                                                    |
| descriptiveRow | Complete HTML table row inserted above the bill list <br><br>**Default value:** `""`                                                                                                                     |
<!-- prettier-ignore-end -->

## Developer hints

Run tests before submitting a PR:

```shell
node --run test
```
