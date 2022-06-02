const axios = require("axios")

const launchesDB = require("./launches.mongo")
const planets = require("./planets.mongo")

const DEFAULT_FLIGHT_NUMBER = 100

const SPACEX_API_URL = "https://api.spacexdata.com/v4/launches/query"

async function populateLaunches(){
    console.log("Downloading launch data from API")
    const response = await axios.post(SPACEX_API_URL, {
        query: {},
        options: {
            pagination: false,
            populate: [
                {
                    path: "rocket",
                    select: {
                        name: 1
                    }
                },
                {
                    path: "payloads",
                    select: {
                        "customers": 1
                    }
                }
            ]
        }
    })

    if(response.status !== 200){
        console.log("problem downloading")
        throw new error("launch data download failed")
    }

    const launchDocs = response.data.docs
    for (const launchDoc of launchDocs) {
        const payloads = launchDoc["payloads"]
        const customers = payloads.flatMap((payload) => {
            return payload["customers"]
        })
        
        const launch = {
            flightNumber: launchDoc["flight_number"],
            mission: launchDoc["name"],
            rocket: launchDoc["rocket"]["name"],
            launchDate: launchDoc["date_local"],
            upcoming: launchDoc["upcoming"],
            success: launchDoc["success"],
            customers
        }
        console.log(`${launch.flightNumber} ${launch.mission}`);

        await saveLaunch(launch)
    }
}

async function loadLaunchData(){
    const firstLaunch = await findLaunch({
        flightNumber: 1,
        rocket: "Falcon 1",
        mission: "FalconSat"
    })
    if(firstLaunch){
        console.log("Launch Data already loaded");
    }
    else{
        await populateLaunches()
    }
}

async function findLaunch(filter){
    return await launchesDB.findOne(filter)
}

async function existsLaunchWithId(launchId){
    return await findLaunch({
        flightNumber: launchId
    })
}

async function getLatestFlightNumber(){
    const lastestLaunch = await launchesDB
        .findOne()
        .sort("-flightNumber")

    if(!lastestLaunch){
        return DEFAULT_FLIGHT_NUMBER
    }

    return lastestLaunch.flightNumber
}

async function getAllLaunches(skip, limit){
    return await launchesDB.find({},
        {
            "_id": 0,
            "__v": 0
        })
        .sort({flightNumber: 1})
        .skip(skip)
        .limit(limit)
}

async function saveLaunch(launch){
    try {
        await launchesDB.findOneAndUpdate({
            flightNumber: launch.flightNumber,
        },
        launch ,{
            upsert: true
        })
    }
    catch (error) {
        console.error(`Could not save launch ${error}`)
    }
}

async function scheduleNewLaunch(launch){
    const planet = await planets.find({
        keplerName: launch.target
    })

    if(!planet){
        throw new Error("No matching planet found")
    }
    
    const newFlightNumber = await getLatestFlightNumber() + 1
    
    const newLaunch = Object.assign(launch,{
        success: true,
        upcoming: true,
        customers: ["ZTM", "NASA"],
        flightNumber: newFlightNumber
    })

    await saveLaunch(newLaunch)
}

async function abortLaunchById(launchId){
    const aborted = await launchesDB.updateOne({
        flightNumber: launchId,
    }, {
        upcoming: false,
        success: false
    })

    return aborted.modifiedCount === 1
}

module.exports = {
    loadLaunchData,
    getAllLaunches,
    scheduleNewLaunch,
    existsLaunchWithId,
    abortLaunchById
}