export type MakerRawPollTag = {
    id: string
    shortname: string
    longname: string
    recommend_ui: boolean
    description?: string
    related_link: string
    precedence: number
}

export type MakerRawPoll = {
    creator: string
    pollId: number
    blockCreated: number
    startDate: string
    endDate: string
    multiHash: string
    url: string
    cursor: string
    slug: string
    parameters: {
        inputFormat: {
            type: string
            abstain: string[]
            options: string[]
        }
        resultDisplay: string
        victoryConditions: any[]
    }
    content: string
    summary: string
    title: string
    options: {
        [key: number]: string | number
    }
    discussionLink: string
    tags: MakerRawPollTag[]
    ctx: {
        prev: null
        next: null
    }
}

export type MakerRawExecutiveProposal = {
    about: string
    content: string
    title: string
    proposalBlurb: string
    key: string
    address: string
    date: string
    active: boolean
    proposalLink: string
    spellData: {
        hasBeenCast: boolean
        hasBeenScheduled: boolean
        eta: string
        expiration: string
        nextCastTime: string
        datePassed: string
        dateExecuted: string
        mkrSupport: string
        executiveHash: string
        officeHours: boolean
    }
}

export type AaveRawProposal = {
    ipfs: {
        title: string
        id: number
        originalHash: string
    }
    proposal: {
        id: number
        creator: string
        executor: string
        targets: string[]
        signatures: string[]
        calldatas: string[]
        withDelegatecalls: boolean[]
        startBlock: number
        endBlock: number
        executionTime: number
        forVotes: string
        againstVotes: string
        executed: boolean
        canceled: boolean
        strategy: string
        state: string
        minimumQuorum: string
        minimumDiff: string
        executionTimeWithGracePeriod: number
        proposalCreated: number
        totalVotingSupply: string
        ipfsHash: string
        startTimestamp: number
        creationTimestamp: number
        expirationTimestamp: number
    }
    prerendered: boolean
}

export type Proposal = {
    title: string
    protocol: string
    type: string
    voteType: string
    options: (string | number)[]
    dateAdded: string
    dateExpiry: string
    voteUrl: string
    forumUrl?: string
}
