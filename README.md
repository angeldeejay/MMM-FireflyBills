# MMM-FireflyBills

A module for the [MagicMirror²](https://github.com/MichMich/MagicMirror) project which creates a table filled with a list gathered from a json request.

All the variables of the objects in the array are represented by a table column.
For every column it checks if a valid DateTime is given, and then formats it to `HH:mm:ss` if it is today or `YYYY-MM-DD` otherwise.

## Installation

```shell
git clone https://github.com/angeldeejay/MMM-FireflyBills
cd MMM-FireflyBills
npm install
```

## Config options

Except `url` all options are optional.

<!-- prettier-ignore-start -->
| **Option**     | **Description**                                                                                                                                                                                          |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| url            | The full url to get the json response from <br><br>**Default value:** `""`                                                                                                                               |
| token          | Define the name of the variable that holds the array to display <br><br>**Default value:** `null`                                                                                                        |
| noDataText     | Text indicating that there is no data. <br><br>**Default value:** `Json data is not of type array! Maybe the config arrayName is not used and should be, or is configured wrong.`                        |
| updateInterval | Milliseconds between the refersh <br><br>**Default value:** `15000`                                                                                                                                      |
| animationSpeed | Speed of the update animation. (Milliseconds)<br>If you don't want that the module blinks during an update, set the value to `0`. <br><br>**Default value:** `500`<br> **Possible values:** `0` - `5000` |
| descriptiveRow | Complete html table row that will be added above the array data <br><br>**Default value:** `""`                                                                                                          |
<!-- prettier-ignore-end -->

## Developer hints

Please use `npm run test` before doing a PR.
