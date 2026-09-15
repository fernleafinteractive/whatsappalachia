import {readFile, writeFile} from "fs/promises";
import {searchItems, getItem} from "@esri/arcgis-rest-portal";
import {slotForKey, updateApiKey, invalidateApiKey, createApiKey} from "@esri/arcgis-rest-developer-credentials";
import {ArcGISIdentityManager} from "@esri/arcgis-rest-request";
import {queryFeatures} from "@esri/arcgis-rest-feature-service";

const default_token = process.env.ARCGIS_TOKEN

async function loadConfig(file_path = "../config.json") {
    const config = JSON.parse(await readFile(file_path, "utf8"));
    return config;
}

async function checkForApp(appTitle, token) {
    const authentication = await ArcGISIdentityManager.fromToken({token: token});
    let searchQuery = `title:"${appTitle}" AND type:"Application"`
    const response = await searchItems({q: searchQuery, authentication});
    if (response.total > 0) {
        const existingApp = response.results[0];
        console.log(`Application found with id: ${existingApp.id}, title: ${existingApp.title}`)
        return existingApp;
    }
    console.log(`No application found with title: ${appTitle}`)
    return null;
}

async function getOrCreateApp(title, description, tags, token){
    const authentication = await ArcGISIdentityManager.fromToken({token: token});
    const existingApp = await checkForApp(title, token);
    if (existingApp) {
        return existingApp;
    }
    const createResponse = await createApiKey({
        title: title,
        description: description,
        tags: tags,
        authentication
    });
    const createdApp = createResponse.item;
    console.log(`Created app with id: ${createdApp.id}, title: ${createdApp.title}`)
    return createdApp;
}

async function generateTokenFromApplication(appItemID, expirationDays, featureServiceIDs, token){
    const authentication = await ArcGISIdentityManager.fromToken({token: token});
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + expirationDays);
    expiration.setHours(23, 59, 59, 999);
    try {
        const updateResponse = await updateApiKey({
            itemId: appItemID,
            generateToken1: true,
            privileges: featureServiceIDs.map((service) => `portal:app:access:item:${service}`),
            apiToken1ExpirationDate: expiration,
            authentication
        });
        console.log(`Generated token for app with id: ${appItemID}`)
        return updateResponse.accessToken1;
    } catch (error) {
        console.log(`Error generating token for app with id: ${appItemID}`)
        console.log(error)
    }
}

async function testFeatureServiceAccess(featureServiceIDs, token) {
    const authentication = await ArcGISIdentityManager.fromToken({token: token});
    const checkPromises = featureServiceIDs.map(async (serviceID) => {
        try {
            const item = await getItem(serviceID, {authentication});
            if (!item || !item.url) {
                console.log(`Feature service with id: ${serviceID} is not accessible`)
                return null;
            }
            const layerURL = `${item.url}/0`
            const checkResponse = await queryFeatures({
                url: layerURL,
                where: "1=1",
                resultRecordCount: 1,
                authentication
            });
            console.log(`Feature service with id: ${serviceID} is accessible`)
            return serviceID;
        } catch (error) {
            console.log(`Feature service with id: ${serviceID} is not accessible`)
            console.log(error)
            return null;
        }
    })
    const results = await Promise.all(checkPromises);
    const accessibleResults = results.filter(result => result !== null);
    if (accessibleResults.length !== featureServiceIDs.length) {
        console.log(`Not all feature services are accessible. ${featureServiceIDs.length - accessibleResults.length} feature services are not accessible.`);
        const inaccessibleFeatureServices = featureServiceIDs.filter(id => !accessibleResults.includes(id));
        console.log(`The following feature services are not accessible: ${inaccessibleFeatureServices.join(', ')}`);
    }
    return accessibleResults;
}

async function main(outputFile="../token.json") {
    let config = await loadConfig();
    const existingApp = await getOrCreateApp(config.title, config.description, config.tags, default_token);
    const newToken = await generateTokenFromApplication(existingApp.id, config.expiration_days, config.feature_services, default_token);
    const accessibleFeatureServices = await testFeatureServiceAccess(config.feature_services, newToken);
    const data = {
        "token": newToken,
        "accessibleFeatureServices": accessibleFeatureServices,
    }
    await writeFile(outputFile, JSON.stringify(data, null, 2));
}

await main();