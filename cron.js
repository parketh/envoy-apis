const CronJob = require("node-cron")
const axios = require("axios")

const server = process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://envoy-apis.herokuapp.com"

exports.initCheckNewProposalsJob = () => {
    const scheduledJobFunction = CronJob.schedule("0 * * * *", async () => {
        try {
            await axios.get(`${server}/api/proposals/fetch-all`, {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
                },
            })
        } catch (err) {
            console.error(err)
        }
    })

    scheduledJobFunction.start()
}

exports.initCheckExpiringProposalsJob = () => {
    const scheduledJobFunction = CronJob.schedule("0 8 * * *", async () => {
        try {
            await axios.get(`${server}/api/proposals/expiring`, {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
                },
            })
        } catch (err) {
            console.error(err)
        }
    })

    scheduledJobFunction.start()
}
