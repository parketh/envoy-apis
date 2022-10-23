const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")

const URL = "https://vote.makerdao.com/polling"

const fetchHtml = async (url) => {
    try {
        const { data } = await axios.get(url)
        return data
    } catch {
        console.error(`ERROR: An error occurred while trying to fetch the URL: ${url}`)
    }
}

const scrape = async () => {
    const html = await fetchHtml(URL)
    const $ = cheerio.load(html)
    const results = $("#__NEXT_DATA__").text()
    fs.writeFileSync("results.json", results)
    let json = JSON.parse(fs.readFileSync("results.json", "utf8"))
    const polls = json.props.pageProps.polls
    return polls
}

const main = async () => {
    const polls = await scrape()
    // console.log(JSON.stringify(json))
}

main()
