import axios from "axios"
import { load } from "cheerio"
// import fs from "fs"
import express, { Request, Response } from "express"
import bodyParser from "body-parser"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import { AaveRawProposal, ArbitrumRawProposal, MakerRawExecutiveProposal, MakerRawPoll, Proposal } from "./types"
const Telegram = require("telegram-notify")
require("dotenv").config()

const server = process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://envoy-apis.herokuapp.com"

const notifyMaker = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.MAKER_CHAT_ID })
const notifyAave = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.AAVE_CHAT_ID })
const notifyArbitrum = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.ARBITRUM_CHAT_ID })
const notifyTest = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.TEST_CHAT_ID })
const app = express()

app.use(helmet()) // adding Helmet to enhance your Rest API's security
app.use(bodyParser.json()) // using bodyParser to parse JSON bodies into JS object
app.use(cors()) // enabling CORS for all requests
app.use(morgan("combined")) // adding morgan to log HTTP requests

app.get("/", (req: Request, res: Response) => {
  res.send("Nothing on this page.")
})

app.get("/api/proposals/fetch/makerdao", async (req: Request, res: Response) => {
  const pollUrl = "https://vote.makerdao.com/api/polling/all-polls"
  const executiveUrl = "https://vote.makerdao.com/api/executive"

  const fetchPolls = async (): Promise<MakerRawPoll[]> => {
    console.log(`/api/proposals/fetch/makerdao:  Fetching poll data from ${pollUrl}`)
    const { data } = await axios.get(pollUrl)
    return data.polls
  }

  const processPolls = (entries: MakerRawPoll[]): Proposal[] => {
    const processedEntries = entries.map((p) => {
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
      }
    })
    return processedEntries
  }

  const fetchExecutiveProposals = async (): Promise<MakerRawExecutiveProposal[]> => {
    console.log(`/api/proposals/fetch/makerdao:  Fetching poll data from ${executiveUrl}`)
    const { data } = await axios.get(executiveUrl)
    return data
  }

  const processExecutiveProposals = (entries: MakerRawExecutiveProposal[]): Proposal[] => {
    const processedExecutiveProposals = entries.map((p) => {
      return {
        title: p.title,
        protocol: "MakerDAO",
        type: "Executive Proposal",
        voteType: "Executive Proposal",
        options: [""],
        dateAdded: p.spellData.datePassed ? p.spellData.datePassed : new Date(Date.parse(p.date)).toLocaleString(),
        dateExpiry: p.spellData.expiration,
        dateExecuted: p.spellData.dateExecuted,
        voteUrl: `https://vote.makerdao.com/executive/${"template-executive-vote-"}${String(p.title)
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
          .replace(/ +(?= )/g, "")
          .toLowerCase()
          .replace(/ /g, "-")}${"#proposal-detail"}`,
        forumUrl: "",
      }
    })
    return processedExecutiveProposals
  }

  try {
    const polls: MakerRawPoll[] = await fetchPolls()
    const processedPolls: Proposal[] = processPolls(polls)

    console.log(`/api/proposals/fetch/makerdao:  Retrieved polls`)
    const executiveProposals: MakerRawExecutiveProposal[] = await fetchExecutiveProposals()
    const processedExecutiveProposals: Proposal[] = processExecutiveProposals(executiveProposals)

    console.log(`/api/proposals/fetch/makerdao:  Retrieved executive proposals`)
    const entries: Proposal[] = processedPolls.concat(processedExecutiveProposals)

    console.log(`/api/proposals/fetch/makerdao:  Returning voting data`)
    res.status(200).json(entries)
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/proposals/fetch/makerdao\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }
})

app.get("/api/proposals/fetch/aave", async (req, res) => {
  const url = "https://app.aave.com/governance/"

  const fetchProposals = async (): Promise<AaveRawProposal[]> => {
    console.log(`/api/proposals/fetch/aave:  Scraping poll data from ${url}`)
    const { data } = await axios.get(url)
    const $ = load(data)

    const results = $("#__NEXT_DATA__").text()
    let json = JSON.parse(Buffer.from(results).toString("utf8"))
    console.log({ json: json.props.pageProps })
    return json.props.pageProps.proposals
  }

  const processProposals = (entries: AaveRawProposal[]): Proposal[] => {
    return entries.map((p) => {
      return {
        title: p.ipfs.title,
        protocol: "Aave",
        dateAdded: new Date(p.proposal.creationTimestamp * 1000).toISOString(),
        dateExpiry: new Date(p.proposal.expirationTimestamp * 1000).toISOString(),
        type: "Executive Proposal",
        voteType: "Executive Proposal",
        options: ["Yae", "Nay"],
        voteUrl: `https://app.aave.com/governance/proposal/?proposalId=${p.ipfs.id}`,
      }
    })
  }

  try {
    const proposals = await fetchProposals()
    const processedProposals = processProposals(proposals)

    res.status(200).json(processedProposals)
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/proposals/fetch/aave\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      // await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }
})

app.get("/api/proposals/fetch/arbitrum", async (req, res) => {
  const url = "https://api.tally.xyz/query"
  const TALLY_API_KEY = process.env.TALLY_API_KEY
  const chainId = "eip155:42161"

  const query = `query Proposals($chainId: ChainID!, $pagination: Pagination, $sort: ProposalSort, $governors: [Address!]) {
    proposals(chainId: $chainId, pagination: $pagination, sort: $sort, governors: $governors) {
      id
      title
      voteStats {
        support
        weight
        votes
        percent
      }
      start {
        timestamp
      }
      end {
        timestamp
      }
      createdTransaction {
        block {
          timestamp
        }
      }
    }
  }`

  const variables = {
    chainId,
    pagination: { limit: 50, offset: 0 },
    sort: { field: "START_BLOCK", order: "DESC" },
    governors: ["0x789fC99093B09aD01C34DC7251D0C89ce743e5a4", "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9"],
  }

  const fetchProposals = async (): Promise<ArbitrumRawProposal[]> => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": TALLY_API_KEY,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    })
    const result = await response.json()
    console.log({ result })
    if (result?.errors) {
      console.error("error when fetching")
      return null
    }
    return result.data.proposals
  }

  const processProposals = (entries: ArbitrumRawProposal[]) => {
    return entries.map((p) => ({
      title: p.title,
      protocol: "Arbitrum",
      type: "AIP",
      voteType: "AIP",
      options: p.voteStats.map((v) => v.support),
      dateAdded: p.createdTransaction.block.timestamp,
      dateExpiry: p.end.timestamp,
      voteUrl: `https://www.tally.xyz/gov/arbitrum/proposal/${p.id}`,
    }))
  }

  try {
    const proposals = await fetchProposals()
    console.log({ proposals })
    const processedProposals = processProposals(proposals)
    res.status(200).json(processedProposals)
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/proposals/fetch/arbitrum\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }
})

app.get("/api/proposals/fetch-all", async (req: Request, res: Response) => {
  let newMakerProposals: Proposal[] = []
  let expiringMakerProposals: Proposal[] = []
  let newAaveProposals: Proposal[] = []
  let expiringAaveProposals: Proposal[] = []
  let newArbitrumProposals: Proposal[] = []
  let expiringArbitrumProposals: Proposal[] = []

  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000 * 1)
  const tomorrow = new Date(today.getTime() + 86400000 * 1.5)

  try {
    console.log(`/api/proposals/fetch-all:  Fetching MakerDAO proposals`)

    const MakerProposalsRequest = await axios.get(`${server}/api/proposals/fetch/makerdao`, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      },
    })
    const MakerFetchedProposals: Proposal[] = MakerProposalsRequest.data

    console.log(`/api/proposals/fetch-all:  Pushing new MakerDAO proposals to Telegram`)

    newMakerProposals = MakerFetchedProposals.filter(
      (p) => p.dateAdded > yesterday.toISOString() && p.dateAdded < today.toISOString()
    )
    console.log("newMakerProposals", newMakerProposals)

    for (const selectedProposal of newMakerProposals) {
      if (selectedProposal.type == "Poll") {
        const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nVote Type: ${selectedProposal.voteType}\nOptions: ${selectedProposal.options}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}\nForum URL: ${selectedProposal.forumUrl}`
        await notifyMaker.send(message)
      } else {
        const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}`
        await notifyMaker.send(message)
      }
    }

    console.log(`/api/proposals/fetch-all:  Pushing expiring MakerDAO proposals to Telegram`)

    expiringMakerProposals = MakerFetchedProposals.filter(
      (p) => p.dateExpiry > today.toISOString() && p.dateExpiry < tomorrow.toISOString()
    )
    console.log("expiringMakerProposals", expiringMakerProposals)

    if (expiringMakerProposals.length !== 0) {
      const message = `❗❗ Expiring Soon\n\n${expiringMakerProposals
        .map((p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`)
        .join("")}`
      await notifyMaker.send(message)
    }
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/proposals/fetch-all\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }

  try {
    console.log(`/api/proposals/fetch-all:  Fetching Aave proposals`)

    const AaveProposalsRequest = await axios.get(`${server}/api/proposals/fetch/aave`, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      },
    })
    const AaveFetchedProposals: Proposal[] = AaveProposalsRequest.data

    console.log(`/api/proposals/fetch-all:  Pushing new Aave proposals to Telegram`)

    newAaveProposals = AaveFetchedProposals.filter(
      (p) => p.dateAdded > yesterday.toISOString() && p.dateAdded < today.toISOString()
    )
    for (const selectedProposal of newAaveProposals) {
      const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}`
      await notifyAave.send(message)
    }

    console.log(`/api/proposals/fetch-all:  Pushing expiring Aave proposals to Telegram`)

    const expiringAaveProposals = AaveFetchedProposals.filter(
      (p) => p.dateExpiry > today.toISOString() && p.dateExpiry < tomorrow.toISOString()
    )

    if (expiringAaveProposals.length !== 0) {
      const message = `❗❗ Expiring Soon\n\n${expiringAaveProposals
        .map((p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`)
        .join("")}`
      await notifyAave.send(message)
    }
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/proposals/fetch-all\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }

  try {
    console.log(`/api/proposals/fetch-all:  Fetching Arbitrum proposals`)

    const ArbitrumProposalsRequest = await axios.get(`${server}/api/proposals/fetch/arbitrum`, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      },
    })
    console.log(`/api/proposals/fetch-all:  Pushing new Arbitrum proposals to Telegram`)

    const ArbitrumFetchedProposals: Proposal[] = ArbitrumProposalsRequest.data

    newArbitrumProposals = ArbitrumFetchedProposals.filter(
      (p) => p.dateAdded > yesterday.toISOString() && p.dateAdded < today.toISOString()
    )
    if (newArbitrumProposals.length !== 0) {
      await notifyArbitrum.send("📣 New proposals")
    }
    for (const selectedProposal of newArbitrumProposals) {
      const message = `${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}`
      await notifyArbitrum.send(message)
    }

    console.log(`/api/proposals/fetch-all:  Pushing expiring Aave proposals to Telegram`)

    expiringArbitrumProposals = ArbitrumFetchedProposals.filter(
      (p) => p.dateExpiry > today.toISOString() && p.dateExpiry < tomorrow.toISOString()
    )

    if (expiringArbitrumProposals.length !== 0) {
      const message = `❗❗ Expiring Soon\n\n${expiringArbitrumProposals
        .map((p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`)
        .join("")}`
      await notifyArbitrum.send(message)
    }
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/proposals/fetch-all\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }

  res.status(200).json({
    new: {
      Maker: newMakerProposals,
      Aave: newAaveProposals,
      Arbitrum: newArbitrumProposals,
    },
    expiring: {
      Maker: expiringMakerProposals,
      Aave: expiringAaveProposals,
      Arbitrum: expiringArbitrumProposals,
    },
  })
})

app.get("/api/test/proposals/fetch-all", async (req: Request, res: Response) => {
  try {
    console.log(`/api/test/proposals/fetch-all:  Fetching MakerDAO proposals`)

    const MakerProposalsRequest = await axios.get(`${server}/api/proposals/fetch/makerdao`, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      },
    })
    const MakerFetchedProposals: Proposal[] = MakerProposalsRequest.data

    console.log(`/api/test/proposals/fetch-all:  Pushing new MakerDAO proposals to Telegram`)

    const today = new Date()
    const yesterday = new Date(today.getTime() - 86400000 * 1)
    const newMakerProposals = MakerFetchedProposals.filter(
      (p) => p.dateAdded > yesterday.toISOString() && p.dateAdded < today.toISOString()
    )
    console.log("newMakerProposals", newMakerProposals)

    for (const selectedProposal of newMakerProposals) {
      if (selectedProposal.type == "Poll") {
        const message = `Protocol: Maker\n\n${selectedProposal.title}\n\nType: ${selectedProposal.type}\nVote Type: ${selectedProposal.voteType}\nOptions: ${selectedProposal.options}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}\nForum URL: ${selectedProposal.forumUrl}`
        await notifyTest.send(message)
      } else {
        const message = `Protocol: Maker\n\n${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}`
        await notifyTest.send(message)
      }
    }

    console.log(`/api/test/proposals/fetch-all:  Pushing expiring MakerDAO proposals to Telegram`)

    const tomorrow = new Date(today.getTime() + 86400000 * 1.5)
    const expiringMakerProposals = MakerFetchedProposals.filter(
      (p) => p.dateExpiry > today.toISOString() && p.dateExpiry < tomorrow.toISOString()
    )
    console.log("expiringMakerProposals", expiringMakerProposals)

    if (expiringMakerProposals.length !== 0) {
      const message = `❗❗ Expiring Soon (Maker)\n\n${expiringMakerProposals
        .map((p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`)
        .join("")}`
      await notifyTest.send(message)
    }

    console.log(`/api/test/proposals/fetch-all:  Fetching Aave proposals`)

    const AaveProposalsRequest = await axios.get(`${server}/api/proposals/fetch/aave`, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      },
    })
    const AaveFetchedProposals: Proposal[] = AaveProposalsRequest.data

    console.log(`/api/test/proposals/fetch-all:  Pushing new Aave proposals to Telegram`)

    const newAaveProposals = AaveFetchedProposals.filter(
      (p) => p.dateAdded > yesterday.toISOString() && p.dateAdded < today.toISOString()
    )
    for (const selectedProposal of newAaveProposals) {
      const message = `Protocol: Aave\n\n${selectedProposal.title}\n\nType: ${selectedProposal.type}\nDate Added: ${selectedProposal.dateAdded}\nExpiry date: ${selectedProposal.dateExpiry}\nVote URL: ${selectedProposal.voteUrl}`
      await notifyTest.send(message)
    }

    console.log(`/api/test/proposals/fetch-all:  Pushing expiring Aave proposals to Telegram`)

    const expiringAaveProposals = AaveFetchedProposals.filter(
      (p) => p.dateExpiry > today.toISOString() && p.dateExpiry < tomorrow.toISOString()
    )

    if (expiringAaveProposals.length !== 0) {
      const message = `❗❗ Expiring Soon (Aave)\n\n${expiringAaveProposals
        .map((p) => `${p.title}\nExpiry date: ${p.dateExpiry}\nVote URL: ${p.voteUrl}\n\n`)
        .join("")}`
      await notifyTest.send(message)
    }

    res.status(200).json({
      new: {
        Maker: newMakerProposals,
        Aave: newAaveProposals,
      },
      expiring: {
        Maker: expiringMakerProposals,
        Aave: expiringAaveProposals,
      },
    })
  } catch (error) {
    let message = "Unknown error"
    if (error instanceof Error) {
      const errorMessage = `⚠️ Error\nOrigin: /api/test/proposals/fetch-all\nDate: ${new Date().toISOString()}\nError: ${
        error.message
      }`
      message = errorMessage
      await notifyTest.send(errorMessage)
    }
    res.status(400).json({ error: message })
  }
})

// starting the server
app.listen(process.env.PORT || 3001, () => {
  console.log("listening on port 3001")
})
