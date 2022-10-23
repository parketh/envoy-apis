const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const { PrismaClient } = require("@prisma/client")
const { proposal } = require("@prisma/client")
const Telegram = require("telegram-notify")
require("dotenv").config()

const server = process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://envoy-apis.herokuapp.com"

const notify = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.CHAT_ID })
const prisma = new PrismaClient()
const app = express()

app.use(helmet()) // adding Helmet to enhance your Rest API's security
app.use(bodyParser.json()) // using bodyParser to parse JSON bodies into JS object
app.use(cors()) // enabling CORS for all requests
app.use(morgan("combined")) // adding morgan to log HTTP requests

app.get("/", (req, res) => {
    res.send("Nothing on this page.")
})

app.get("/api/proposals/fetch/makerdao", async (req, res) => {
    const pollUrl = "https://vote.makerdao.com/polling"
    const executiveUrl = "https://vote.makerdao.com/executive"

    const fetchJSON = async (url) => {
        console.log(`/api/proposals/fetch/makerdao:  Scraping poll data from ${url}`)
        const { data: html } = await axios.get(url)
        const $ = cheerio.load(html)
        const results = $("#__NEXT_DATA__").text()
        fs.writeFileSync("results.json", results)
        let json = JSON.parse(fs.readFileSync("results.json", "utf8"))
        return json
    }

    const processPollsJSON = async (json) => {
        const entries = json.props.pageProps.polls
        const data = entries.map((p) => {
            return {
                title: p.title,
                type: "Poll",
                voteType: p.parameters.inputFormat.type
                    .split("-")
                    .map((word) => word[0].toUpperCase() + String(word).substring(1))
                    .join(" "),
                options: Object.values(p.options),
                dateAdded: p.startDate,
                dateExpiry: p.endDate,
                voteUrl: `https://vote.makerdao.com/polling/${p.slug}`,
                forumUrl: p.discussionLink,
                status: "Unassigned",
            }
        })
        return data
    }

    const processExecutiveJSON = async (json) => {
        const entries = json.props.pageProps.proposals
        const data = entries.map((p) => {
            return {
                title: p.title,
                type: "Executive Proposal",
                voteType: "Executive Proposal",
                options: [""],
                dateAdded: p.spellData.datePassed,
                dateExpiry: p.spellData.expiration,
                dateExecuted: p.spellData.dateExecuted,
                voteUrl: `https://vote.makerdao.com/executive/${"template-executive-vote-"}${String(p.title)
                    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
                    .replace(/ +(?= )/g, "")
                    .toLowerCase()
                    .replace(/ /g, "-")}${"#proposal-detail"}`,
                forumUrl: "",
                status: "Unassigned",
            }
        })
        return data
    }

    const pollsJSON = await fetchJSON(pollUrl)
    const polls = await processPollsJSON(pollsJSON)
    console.log(`/api/proposals/fetch/makerdao:  Retrieved polls`)
    const executiveJSON = await fetchJSON(executiveUrl)
    const executive = await processExecutiveJSON(executiveJSON)
    console.log(`/api/proposals/fetch/makerdao:  Retrieved executive proposals`)
    const proposals = polls.concat(executive)
    console.log(`/api/proposals/fetch/makerdao:  Returning voting data`)
    res.status(200).json(proposals)
})

app.post("/api/proposals/save", async (req, res) => {
    const data = req.body

    const createProposal = async (data) => {
        const newProposal = await prisma.proposal.create({
            data: {
                title: data.title,
                protocol: {
                    connect: {
                        name: "MakerDAO",
                    },
                },
                type: data.type,
                voteType: data.voteType,
                options: data.options,
                dateAdded: data.dateAdded,
                dateExpiry: data.dateExpiry,
                voteUrl: data.voteUrl,
                forumUrl: data.forumUrl,
                status: data.status,
            },
        })
        console.log(`/api/proposals/save:  Created new proposal`)
        return newProposal
    }

    try {
        const newProposal = await createProposal(data)
        res.status(200).json(newProposal)
    } catch (e) {
        if (e) {
            if (e.code === "P2002") {
                res.status(404).send({
                    error: "There is a unique constraint violation, a new proposal with this title already exists",
                })
            } else {
                res.status(404).send({
                    error: "Unknown Prisma error",
                })
            }
        } else {
            res.status(404).send({
                error: "Unknown error",
            })
        }
    }
})

app.get("/api/proposals/fetch-all", async (req, res) => {
    const proposalsRequest = await axios.get(`${server}/api/proposals/fetch/makerdao`, {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        },
    })
    const fetchedProposals = proposalsRequest.data
    const newProposals = []

    console.log(`/api/proposals/fetch-all:  Fetched makerdao proposals`)

    for (const selectedProposal of fetchedProposals) {
        const existingProposal = await prisma.proposal.findUnique({
            where: {
                title: selectedProposal.title,
            },
        })
        if (!existingProposal) {
            console.log(`/api/proposals/fetch-all:  Saving new proposal: ${selectedProposal.name}`)
            try {
                const response = await axios.post(`${server}/api/proposals/save`, selectedProposal, {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/plain, */*",
                        "User-Agent": "*",
                        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
                    },
                })
                if (response.status === 200) {
                    const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nVote Type: ${selectedProposal.voteType}\nOptions: ${selectedProposal.options}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}\nForum URL: ${selectedProposal.forumUrl}`
                    await notify.send(message)
                }
                console.log(`/api/proposals/fetch-all:  Saved new proposal`)
            } catch (err) {
                console.error(err)
            }
        }
    }
    res.status(200).json({ message: "done" })
})

// starting the server
app.listen(process.env.PORT || 3001, () => {
    console.log("listening on port 3001")
})
