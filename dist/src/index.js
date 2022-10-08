"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const chrome_aws_lambda_1 = __importDefault(require("chrome-aws-lambda"));
const client_1 = require("@prisma/client");
const client_2 = require("@prisma/client");
const Telegram = require("telegram-notify");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const config_1 = require("../config");
let notify = new Telegram({ token: process.env.BOT_TOKEN, chatId: process.env.CHAT_ID });
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
var ProposalType;
(function (ProposalType) {
    ProposalType[ProposalType["poll"] = 0] = "poll";
    ProposalType[ProposalType["executive"] = 1] = "executive";
})(ProposalType || (ProposalType = {}));
var Status;
(function (Status) {
    Status[Status["Unassigned"] = 0] = "Unassigned";
    Status[Status["Assigned"] = 1] = "Assigned";
    Status[Status["Submitted"] = 2] = "Submitted";
})(Status || (Status = {}));
app.use((0, helmet_1.default)()); // adding Helmet to enhance your Rest API's security
app.use(body_parser_1.default.json()); // using bodyParser to parse JSON bodies into JS object
app.use((0, cors_1.default)()); // enabling CORS for all requests
app.use((0, morgan_1.default)("combined")); // adding morgan to log HTTP requests
app.get("/", (req, res) => {
    res.send("Nothing on this page.");
});
app.get("/api/proposals/fetch/makerdao", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const scrape = (type) => __awaiter(void 0, void 0, void 0, function* () {
        const slug = type === ProposalType.poll ? "polling" : "executive";
        console.log(`/api/proposals/fetch/makerdao:  Scraping ${slug} data`);
        console.log(`/api/proposals/fetch/makerdao:  Launching browser`);
        const browser = yield puppeteer_core_1.default.launch({
            args: [
                ...chrome_aws_lambda_1.default.args,
                "--hide-scrollbars",
                "--disable-web-security",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
            defaultViewport: chrome_aws_lambda_1.default.defaultViewport,
            executablePath: yield chrome_aws_lambda_1.default.executablePath,
            headless: true,
            ignoreHTTPSErrors: true,
        });
        const page = yield browser.newPage();
        yield page.goto(`https://vote.makerdao.com/${slug}`);
        const element = yield page.waitForSelector("#__NEXT_DATA__");
        const text = yield page.evaluate((element) => element === null || element === void 0 ? void 0 : element.textContent, element);
        browser.close();
        console.log(`/api/proposals/fetch/makerdao:  Closed browser`);
        if (!text)
            return [];
        const entries = JSON.parse(text).props.pageProps[slug === "polling" ? "polls" : "proposals"];
        const data = slug === "polling"
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
                    status: Status.Unassigned,
                };
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
                    status: Status.Unassigned,
                };
            });
        return data;
    });
    const polls = yield scrape(ProposalType.poll);
    console.log(`/api/proposals/fetch/makerdao:  Retrieved polls`);
    const proposals = yield scrape(ProposalType.executive);
    console.log(`/api/proposals/fetch/makerdao:  Retrieved executive proposals`);
    const data = polls.concat(proposals);
    console.log(`/api/proposals/fetch/makerdao:  Returning voting data`);
    res.status(200).json(data);
}));
app.post("/api/proposals/save", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = req.body;
    const createProposal = (data) => __awaiter(void 0, void 0, void 0, function* () {
        const newProposal = yield prisma.proposal.create({
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
        });
        console.log(`/api/proposals/save:  Created new proposal`);
        return newProposal;
    });
    try {
        const newProposal = yield createProposal(data);
        res.status(200).json(newProposal);
    }
    catch (e) {
        if (e instanceof client_2.Prisma.PrismaClientKnownRequestError) {
            if (e.code === "P2002") {
                res.status(404).send({
                    error: "There is a unique constraint violation, a new proposal with this title already exists",
                });
            }
            else {
                res.status(404).send({
                    error: "Unknown Prisma error",
                });
            }
        }
        else {
            res.status(404).send({
                error: "Unknown error",
            });
        }
    }
}));
app.get("/api/proposals/fetch-all", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const proposalResponse = yield (0, cross_fetch_1.default)(`${config_1.server}/api/proposals/fetch/makerdao`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        },
    });
    const fetchedProposals = yield proposalResponse.json();
    console.log(`/api/proposals/fetch-all:  Fetched makerdao proposals`);
    for (const selectedProposal of yield fetchedProposals) {
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
        };
        const response = yield (0, cross_fetch_1.default)(`${config_1.server}/api/proposals/save`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/plain, */*",
                "User-Agent": "*",
                "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
            },
            body: JSON.stringify(data),
        });
        console.log(`/api/proposals/fetch-all:  Saved new proposal`);
        const newProposal = yield response.json();
        if (response.status === 200) {
            const message = `${data.title}\n\nType: ${data.type}\nVote Type: ${data.voteType}\nOptions: ${data.options}\nDate Added: ${data.dateAdded}\nExpiry date: ${data.dateExpiry}\nVote URL: ${data.voteUrl}\nForum URL: ${data.forumUrl}`;
            yield notify.send(message);
        }
    }
    res.status(200).json({ message: "done" });
}));
// starting the server
app.listen(3001, () => {
    console.log("listening on port 3001");
});
//# sourceMappingURL=index.js.map