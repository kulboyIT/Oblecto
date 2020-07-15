import databases from '../../submodules/database';


export default class MovieCleaner {
    constructor(oblecto) {
        this.oblecto = oblecto;
    }

    async removeFileLessMovies() {
        console.log('Removing movies with no linked files');

        let results;

        try {
            results = await databases.movie.findAll({
                include: [databases.file]
            });
        } catch (e) {
            console.log(e);
        }

        for (let item of results) {
            if (item.files && item.files.length > 0)
                continue;

            console.log(`Removing ${item.movieName}`);

            try {
                await item.destroy();
            } catch (e) {
                console.log('An error occured while destroying file entry:', e);
            }

        }

    }
}
