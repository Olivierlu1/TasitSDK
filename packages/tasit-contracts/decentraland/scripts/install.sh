#!/bin/bash
PROJECT_DIR=$1
DECENTRALAND_DIR="$PROJECT_DIR/decentraland"
REPOS="mana land"

for repo in $REPOS;
do
    #if [ ! -d "$DECENTRALAND_DIR/$repo" ]; then
    rm -rf $DECENTRALAND_DIR/$repo
    git clone https://github.com/decentraland/$repo.git $DECENTRALAND_DIR/$repo
    #fi

    npm i --prefix $DECENTRALAND_DIR/$repo
done
