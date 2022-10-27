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

const notifyMaker = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.MAKER_CHAT_ID })
const notifyAave = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.AAVE_CHAT_ID })
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
                protocol: "MakerDAO",
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
                protocol: "MakerDAO",
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

app.get("/api/proposals/fetch/aave", async (req, res) => {
    const url = "https://app.aave.com/governance/"
    let proposals = []

    console.log(`/api/proposals/fetch/aave:  Scraping poll data from ${url}`)
    const { data: html } = await axios.get(url)
    const $ = cheerio.load(html)
    $("div:not([id]):not([class])")
        .children("a")
        .each(async (idx, val) => {
            const status = $(val).find("div:nth-child(1) > div > span:nth-child(1)").text()
            const href = $(val).attr("href")

            const proposalId = href.match(/\d+/g)
            const { data: details } = await axios.get(`${server}/api/proposals/fetch/aave/${proposalId}`)

            const proposal = {
                title: $(val).find("div > h3").text(),
                protocol: "Aave",
                dateAdded: details.dateAdded,
                dateExpiry: details.dateExpiry,
                status: status ? status : "Upcoming",
                type: "Executive Proposal",
                voteType: "Executive Proposal",
                options: ["Yae", "Nay"],
                voteUrl: `https://app.aave.com${href}`,
                forumUrl: details.forumUrl,
                status: "Unassigned",
            }
            proposals.push(proposal)
        })
    setTimeout(() => {
        console.log(proposals)
        res.status(200).json(
            proposals.sort((a, b) => {
                return new Date(b.dateAdded) - new Date(a.dateAdded)
            })
        )
    }, [5000])
})

app.get("/api/proposals/fetch/aave/:id", async (req, res) => {
    const { id } = req.params
    const url = `https://app.aave.com/governance/proposal/${id}`
    let details = { dateAdded: "", dateExpiry: "", forumUrl: "" }

    const { data: html } = await axios.get(url)
    const $ = cheerio.load(html)
    $("main > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > div").each((idx, val) => {
        let date = $(val).find("div:nth-child(2) > p:nth-child(1)").text()
        if (idx === 0) details.dateAdded = new Date(date)
        if (idx === 2) details.dateExpiry = new Date(date)
    })
    $("main > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > div > a").each((idx, val) => {
        if (idx === 0) details.forumUrl = $(val).attr("href")
    })
    res.status(200).json(details)
})

app.post("/api/proposals/save", async (req, res) => {
    const data = req.body

    const createProposal = async (data) => {
        const newProposal = await prisma.proposal.create({
            data: {
                title: data.title,
                protocol: {
                    connect: {
                        name: data.protocol,
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
    const MakerProposalsRequest = await axios.get(`${server}/api/proposals/fetch/makerdao`, {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        },
    })
    const MakerFetchedProposals = MakerProposalsRequest.data
    console.log(`/api/proposals/fetch-all:  Fetched MakerDAO proposals`)

    const AaveProposalsRequest = await axios.get(`${server}/api/proposals/fetch/aave`, {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        },
    })
    const AaveFetchedProposals = AaveProposalsRequest.data
    console.log(`/api/proposals/fetch-all:  Fetched Aave proposals`)

    for (const selectedProposal of MakerFetchedProposals) {
        const existingProposal = await prisma.proposal.findUnique({
            where: {
                title: selectedProposal.title,
            },
        })
        if (!existingProposal) {
            console.log(`/api/proposals/fetch-all:  Saving new proposal`)
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
                    if (selectedProposal.type == "Poll") {
                        const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nVote Type: ${selectedProposal.voteType}\nOptions: ${selectedProposal.options}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}\nForum URL: ${selectedProposal.forumUrl}`
                        await notifyMaker.send(message)
                    } else {
                        const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}`
                        await notifyMaker.send(message)
                    }
                }
                console.log(`/api/proposals/fetch-all:  Saved new proposal`)
            } catch (err) {
                console.error(err)
            }
        }
    }

    for (const selectedProposal of AaveFetchedProposals) {
        const existingProposal = await prisma.proposal.findUnique({
            where: {
                title: selectedProposal.title,
            },
        })
        if (!existingProposal) {
            console.log(`/api/proposals/fetch-all:  Saving new proposal`)
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
                    if (selectedProposal.type == "Poll") {
                        const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nVote Type: ${selectedProposal.voteType}\nOptions: ${selectedProposal.options}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}\nForum URL: ${selectedProposal.forumUrl}`
                        await notifyAave.send(message)
                    } else {
                        const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}\nForum URL: ${selectedProposal.forumUrl}`
                        await notifyAave.send(message)
                    }
                }
                console.log(`/api/proposals/fetch-all:  Saved new proposal`)
            } catch (err) {
                console.error(err)
            }
        }
    }

    res.status(200).json({ message: "done" })
})

app.get("/api/proposals/expiring", async (req, res) => {
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 86400000 * 1.5) // next 1.5 days

    const expiringProposals = await prisma.proposal.findMany({
        where: {
            dateExpiry: {
                gte: today,
                lte: tomorrow,
            },
        },
    })

    if (expiringProposals) {
        const MakerExpiringProposals = expiringProposals.filter((p) => p.protocolId === 1)
        if (MakerExpiringProposals.length !== 0) {
            const MakerMessage = `❗❗ Expiring Soon\n\n${MakerExpiringProposals.map(
                (p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`
            ).join("")}`
            await notifyMaker.send(MakerMessage)
        }

        const AaveExpiringProposals = expiringProposals.filter((p) => p.protocolId === 2)
        if (AaveExpiringProposals.length !== 0) {
            const AaveMessage = `❗❗ Expiring Soon\n\n${AaveExpiringProposals.map(
                (p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`
            ).join("")}`
            await notifyAave.send(AaveMessage)
        }
        res.status(200).json(expiringProposals)
    } else {
        res.status(200).json({ message: "No new expiring proposals" })
    }
})

// starting the server
app.listen(process.env.PORT || 3001, () => {
    console.log("listening on port 3001")
})
