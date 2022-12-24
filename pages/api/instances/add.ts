// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
const dotenv = require('dotenv')
dotenv.config()
import generator, { Entity, Response } from 'megalodon'
import { Prisma } from '@prisma/client'
import prismac from '../../../lib/prisma'
import { testURI } from './cache'

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== 'POST') {
        return res
            .status(405)
            .json({ message: 'Invalid API Method', type: 'error' })
    }

    const instanceData: { uri: string; type: string; nsfwflag: string } =
        req.body

    if ((await testURI(instanceData.uri)) == false) {
        res.status(400).json({ message: 'failed to verify URI', type: 'error' })
    } else {
        let cachedata = await testURI(instanceData.uri)
        try {
            const savedInstance = await prismac.instances.create({
                data: {
                    name: cachedata.title,
                    type: instanceData.type,
                    nsfwflag: instanceData.nsfwflag,
                    uri: instanceData.uri,
                    verified: false,
                    InstanceData: {
                        create: { cache: JSON.stringify(cachedata) },
                    },
                },
            })

            // Absolutely force the value to be false after creation!
            const unverifiedInstance = await prismac.instances.update({
                where: { uri: instanceData.uri },
                data: { verified: false },
            })

            if (cachedata.contact_account?.username) {
                const BASE_URL: string = 'https://social.effy.space'
                const client = generator(
                    'mastodon',
                    BASE_URL,
                    process.env.ACCESS_TOKEN
                )
                const toot =
                    '@' +
                    cachedata.contact_account.username +
                    '@' +
                    instanceData.uri +
                    ' Hi there someone is attempting to register your instance on TransFediverse, if this is you. Please click this link to finish the registation: https://transfediverse.org/api/instances/verify/' +
                    savedInstance.api_key
                res.status(200).json({
                    message:
                        'Added instance successfully, your instance admin account needs to be verfied! Check your DMs!',
                    type: 'success',
                })
                client
                    .postStatus(toot, { visibility: 'direct' })
                    .then((res: Response<Entity.Status>) => {
                        console.log(res.data)
                    })
            } else {
                res.status(200).json({
                    message:
                        'Added instance successfully, but you will need to manually verify it. Please message @effy@effy.space from an admin account.',
                    type: 'success',
                })
            }


        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError) {
                if (err.code === 'P2002') {
                    res.status(400).json({
                        message: 'Instance already exists',
                        type: 'error',
                    })
                } else {
                    res.status(400).json({
                        message: err.message,
                        type: 'error',
                    })
                }
            } else if (err instanceof Prisma.PrismaClientValidationError) {
                res.status(400).json({ message: err.message, type: 'error' })
            }
        }
    }
}
