# JamesBot
The revived version of the Stack Overflow chat bot [JamesBot](https://github.com/jbis9051/JamesSOBot/).

To run:

```
git clone https://github.com/Parking-Master/JamesBot
cd JamesBot
npm install
```

Then, edit the file `index.js` and change YOUR_ACCOUNT_USER_ID, YOUR_ACCOUNT_EMAIL and YOUR_ACCOUNT_PASSWORD to the appropriate variables.

Also, set the `__dirname` in both the `index.js` and `commands.js` files to the absolute directory which JamesBot is in.

Then, to start the bot at any time, simply run:

```
node index.js
```

A successful run will only show:

```
Logged in
```

Then it will log some live data later on.

Note that JamesBot expects you are running Node.js v22 or higher.
