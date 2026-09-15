import { readFile } from "fs/promises";
import { searchItems } from "@esri/arcgis-rest-portal";
import { slotForKey, updateApiKey, invalidateApiKey } from "@esri/arcgis-rest-developer-credentials";
import { ArcGISIdentityManager } from "@esri/arcgis-rest-request";

const default_token = process.env.ARCGIS_TOKEN

async function loadConfig(file_path="../config.json") {
    const config = JSON.parse(await readFile(file_path, "utf8"));
    return config;
}

async function checkForApp(appTitle, token, portalURL="https://www.arcgis.com") {
    const authentication = await ArcGISIdentityManager.fromToken({token: token});
    let searchQuery = `title:"${appTitle}" AND type:"Application"`
    const response = await searchItems({ q: searchQuery, authentication });
    if (response.total > 0){
        const existingApp = response.results[0];
        console.log(`Application found with id: ${existingApp.id}, title: ${existingApp.title}`)
        return existingApp;
    }
    console.log(`No application found with title: ${appTitle}`)
    return null;
}


let config = await loadConfig();
await checkForApp(config.token_name, default_token);