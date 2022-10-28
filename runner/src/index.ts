import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import {throws} from "assert";
import * as process from "process";
import {DateTime} from 'luxon';

export interface Article {
    title:string
    slug:string
    rootPath:string
    tags?:string[]
    createdAt?:string
    description?:string
    serie?: string
    author?:string
    rawUrl:string
}

export interface Series {
    title: string
    slug:string
    description: string
    numArticles:number
    type: "ordered" | 'unordered'
    rootPath:string
}


const slugify = (text:string) => text.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')


export const getDistinctTags = (articles:Article[])=>{
    const tags = new Set<string>()
    for (const article of articles){
        if (article.tags && article.tags.length >0){
            tags.add(article.tags[0])
        }
    }
    return Array.from(tags)

}


const getArticleMetadata = (articlePath:string):Article | null => {
    if (fs.existsSync(articlePath)){
        const source = fs.readFileSync(articlePath)
        const { content,data: metadata } = matter(source)
        if (metadata.title){
            const slug = slugify(metadata.title)
            return {
                slug,
                title: metadata.title,
                tags: metadata.tags && metadata.tags.map((item:any) => item.toUpperCase()),
                createdAt: metadata.createdAt,
                description: metadata.description,
                content,
                headings: metadata.headings,
                author: metadata.author,
                rootPath: articlePath.slice(0,articlePath.lastIndexOf("/")),
                rawUrl: `https://raw.githubusercontent.com/filipmacek/resources/main/articles`
            } as Article
        }
    }
    return null
}


function createTagObject(articles:Article[]){
    const result:Record<string,Article[]>= {}
    const tags = getDistinctTags(articles).sort((a,b)=> a.localeCompare(b)).map(capitalize)
    for (const article of articles){
        let tag;
        if (article.tags && article.tags.length >0){tag = capitalize(article.tags[0])}else{tag = "Others"}
        if (!(tag in result)){result[tag] = []}
        result[tag].push(article)
    }
    return result
}

function formatArticle(article:Article):string {

    return `${DateTime.fromISO(article.createdAt || new Date().toISOString()).toFormat(   "dd LLL','y")}\\\n**${article.title}**\\\n${article.description}\n`
}

function writeToReadme(articles:Article[]) {
    const intro = fs.readFileSync("../intro.md",{encoding: "utf-8"})
    let result = intro
    const tagsObject = createTagObject(articles)
    for (const tag of Object.keys(tagsObject)){
        result += `\n## ${capitalize(tag)}\n`
        for (const article of tagsObject[tag]){
            result += formatArticle(article)
        }
    }

    fs.writeFileSync('../README.md',result)

}

const capitalize = (input:string)=>{
    return input[0].toUpperCase()+input.slice(1)
}

export const getAllArticles = async () => {
    const ARTICLE_ROOT= process.env.ARTICLE_ROOT
    if (ARTICLE_ROOT === undefined){
        throw new Error("ARTICLE_ROOT environmental variable not set")
    }
    const results:{params: {slug:string}}[] = []
    // Init
    const articles: Article[] = []
    const series:Series[] = []
    const dirs = fs.readdirSync(ARTICLE_ROOT,{withFileTypes: true})
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
    for (const dir of dirs) {
        const pathRoot = path.join(ARTICLE_ROOT, dir)
        const articleDirs = fs.readdirSync(pathRoot, { withFileTypes: true })
            .filter((item) => item.isDirectory() && item.name !== 'series')
            .map((item) => item.name)
        for (const articleDir of articleDirs) {
            const articlePath = path.join(ARTICLE_ROOT,dir, articleDir)
            const article = getArticleMetadata(path.join(articlePath,"article.mdx"))
            if (article){
                const rawUrl = `https://raw.githubusercontent.com/filipmacek/resources/articles/${dir}/${articleDir}/article.mdx`
                results.push({ params: { slug: article.slug } })
                articles.push({...article,rawUrl})
            }
        }
        // Check if it has series
        const seriesDirPath = path.join(pathRoot,'series')
        if(fs.existsSync(seriesDirPath)){
            const seriesDirs = fs.readdirSync(seriesDirPath
                ,{withFileTypes: true})
                .filter((item)=> item.isDirectory())
                .map(item => item.name)
            for (const seriePath of seriesDirs){
                let numArticles = 0
                const serieMetaPath = path.join(seriesDirPath,seriePath,"info.json")
                if (fs.existsSync(serieMetaPath)){
                    const serie:Series = JSON.parse(fs.readFileSync(serieMetaPath,{encoding: "utf-8"}))


                    const serieArticles = fs.readdirSync(path.join(seriesDirPath,seriePath),{withFileTypes: true})
                        .map((item)=> item.name)
                    for (const item of serieArticles){
                        const article = getArticleMetadata(path.join(seriesDirPath,seriePath,item))
                        if (article){
                            results.push({ params: { slug: article.slug } })

                            const rawUrl = `https://raw.githubusercontent.com/filipmacek/resources/articles/${dir}/series/${seriePath}/${item}`;
                            articles.push({
                                ...article,
                                serie: serie.title,
                                rawUrl
                            })
                            numArticles+=1
                        }
                    }
                    if (serie.title){
                        series.push({
                            ...serie,
                            slug: slugify(serie.title),
                            numArticles,
                            rootPath: seriePath
                        })
                    }
                }
            }
        }
    }
    fs.writeFileSync("../metadata_articles.json",JSON.stringify(articles))
    fs.writeFileSync("../metadata_series.json",JSON.stringify(series))
    writeToReadme(articles)
    return results
}




function main(){
    getAllArticles()
}


main()
