const express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const fetch = require("cross-fetch")
const puppeteer = require("puppeteer-core")
// const chromium = require("chrome-aws-lambda")
const { PrismaClient } = require("@prisma/client")
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
    const scrape = async (slug) => {
        console.log(`/api/proposals/fetch/makerdao:  Scraping ${slug} data`)
        console.log(`/api/proposals/fetch/makerdao:  Launching browser`)
        const browser = await puppeteer.launch({
            args: ["--hide-scrollbars", "--disable-web-security", "--no-sandbox", "--disable-setuid-sandbox"],
            // defaultViewport: chromium.defaultViewport,
            // executablePath: await chromium.executablePath,
            headless: true,
            ignoreHTTPSErrors: true,
        })

        const page = await browser.newPage()

        await page.goto(`https://vote.makerdao.com/${slug}`)
        const element = await page.waitForSelector("#__NEXT_DATA__")
        const text = await page.evaluate((element) => element?.textContent, element)

        browser.close()
        console.log(`/api/proposals/fetch/makerdao:  Closed browser`)

        if (!text) return []

        const entries = JSON.parse(text).props.pageProps[slug === "polling" ? "polls" : "proposals"]
        const data =
            slug === "polling"
                ? entries.map((p) => {
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
                          voteUrl: `https://vote.makerdao.com/${slug}/${p.slug}`,
                          forumUrl: p.discussionLink,
                          status: "Unassigned",
                      }
                  })
                : entries.map((p) => {
                      return {
                          title: p.title,
                          type: "Executive Proposal",
                          voteType: "Executive Proposal",
                          options: [""],
                          dateAdded: p.spellData.datePassed,
                          dateExpiry: p.spellData.expiration,
                          dateExecuted: p.spellData.dateExecuted,
                          voteUrl: `https://vote.makerdao.com/${slug}/${"template-executive-vote-"}${String(p.title)
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

    const polls = await scrape("polling")
    console.log(`/api/proposals/fetch/makerdao:  Retrieved polls`)
    const proposals = await scrape("executive")
    console.log(`/api/proposals/fetch/makerdao:  Retrieved executive proposals`)
    const data = polls.concat(proposals)
    console.log(`/api/proposals/fetch/makerdao:  Returning voting data`)
    res.status(200).json(data)
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
    const proposalResponse = await fetch(`${server}/api/proposals/fetch/makerdao`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        },
    })

    const fetchedProposals = await proposalResponse.json()

    console.log(`/api/proposals/fetch-all:  Fetched makerdao proposals`)

    for (const selectedProposal of await fetchedProposals) {
        const data = {
            title: selectedProposal.title,
            protocol: {
                connect: {
                    name: "MakerDAO",
                },
            },
            type: selectedProposal.type,
            dateAdded: selectedProposal.dateAdded,
            dateExpiry: selectedProposal.dateExpiry,
            voteType: selectedProposal.voteType,
            options: selectedProposal.options,
            voteUrl: selectedProposal.voteUrl,
            forumUrl: selectedProposal.forumUrl,
            status: selectedProposal.status,
        }

        const response = await fetch(`${server}/api/proposals/save`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/plain, */*",
                "User-Agent": "*",
                "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
            },
            body: JSON.stringify(data),
        })

        console.log(`/api/proposals/fetch-all:  Saved new proposal`)

        const newProposal = await response.json()
        if (response.status === 200) {
            const message = `${data.title}\n\nType: ${data.type}\nVote Type: ${data.voteType}\nOptions: ${data.options}\nDate Added: ${data.dateAdded}\nExpiry date: ${data.dateExpiry}\nVote URL: ${data.voteUrl}\nForum URL: ${data.forumUrl}`
            await notify.send(message)
        }
    }
    res.status(200).json({ message: "done" })
})

// starting the server
app.listen(process.env.PORT || 3001, () => {
    console.log("listening on port 3001")
})
