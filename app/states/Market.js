/*
 * The Market
 * - manages the initialization of The Market minigame (players, pieces, board)
 * - manages turns, game end, and UI for The Market
 */

import 'pixi';
import 'p2';
import * as Phaser from 'phaser';
import $ from 'jquery';
import _ from 'underscore';
import Tile from 'market/Tile';
import Product from 'game/Product';
import Market from 'market/Market';
import MarketView from 'views/Market';
import Confirm from 'views/alerts/Confirm';
import Alert from 'views/alerts/Alert';


class TheMarket extends Phaser.State {
  constructor(game, player, debug) {
    super();
    this.game = game;
    this.player = player;
    this.debug = debug;
  }

  init(product, competitor, player) {
    this.product = product;
    this.competitor = competitor;
    this.player = player || this.player;
  }

  preload() {
    var self = this;
    this.game.scale.scaleMode = Phaser.ScaleManager.USER_SCALE;
    this.game.scale.setUserScale(0.5, 0.5);

    _.each(['emptyTile', 'influencerTile', 'income0Tile', 'income1Tile', 'income2Tile', 'income3Tile'], function(sprite) {
        self.game.load.image(sprite, 'assets/tiles/'+sprite+'.png');
     });

    this.game.load.image('productPiece', 'assets/themarket/product.png');
  }

  create() {
    $('#office').hide();
    $('#market').show().addClass('market-active');
    $('body').addClass('market-background');

    var market = new Market(this.product, this.player, this.game, this.competitor, this.debug);
    this.market = market;
    this.market.endGame = this.endGame.bind(this);

    this.view = new MarketView({
      handlers: {
        '.end-turn': function() {
          var movesLeft = _.some(market.humanPlayer.pieces, p => p.moves > 0);
          if (movesLeft) {
            var view = new Confirm(market.endTurn.bind(market));
            view.render('You still have moves remaining, is that ok?', 'End the turn', 'Nevermind');
          } else {
            market.endTurn();
          }
        }
      }
    });

    // re-render the UI whenever a tile is selected or captured
    Tile.onSingleClick.add(this.renderUI, this);
    Tile.onCapture.add(this.renderUI, this);
    Tile.onCapture.add(this.captureNotice, this);
    market.board.onCombat = this.combatNotice.bind(this);
    market.onStartTurn = () => {
      this.renderUI(market.board.selectedTile);
    };
    market.startTurn(market.humanPlayer);
  }

  update() {
    this.player.onboarder.resolve();
  }

  notice(tile, msg, offset) {
    var offset = offset || 70,
        coord = this.market.board.coordinateForPosition(tile.position),
        text = this.game.add.text(
          coord.x - offset, coord.y, msg,
          {fill: '#ffffff', stroke: '#000000', strokeThickness: 2, font: 'bold 24pt Work Sans'}),
        tween;
    this.market.board.tileGroup.add(text);
    tween = this.game.add.tween(text).to({
      x: coord.x - offset,
      y: coord.y - 100,
      alpha: 0
    }, 4000, Phaser.Easing.Quadratic.Out, true);
    tween.onComplete.add(function() {
      text.destroy();
    });
    tween.start();
  }

  combatNotice(report) {
    if (report.destroyed.defender) {
      this.notice(report.tiles.defender, 'Wrecked!', 25);
    } else if (report.damageTaken.defender) {
      this.notice(report.tiles.defender, `-${report.damageTaken.defender} health`, 25);
    }

    if (report.destroyed.attacker) {
      this.notice(report.tiles.attacker, 'Wrecked!', 25);
    } else if (report.damageTaken.attacker) {
      this.notice(report.tiles.attacker, `-${report.damageTaken.attacker} health`, 25);
    }
  }

  captureNotice(tile) {
    var msg = tile instanceof Tile.Income ? `+${(((tile.income + 1)/this.market.totalIncome) * 100).toFixed(2)}% market share` : 'Captured influencer!';
    this.notice(tile, msg);
  }

  renderUI(tile) {
    var market = this.market;
    var t = _.clone(tile) || {};
    t.owned = t.owner == market.humanPlayer;
    t.capturing = t.capturedCost > 0;

    t.tileClass = 'neutral';
    if (t.owned) {
      t.tileClass = 'friendly';
    } else if (!_.isUndefined(t.owner)) {
      t.tileClass = 'hostile';
    }
    if (t.piece) {
      t.pieceClass = t.piece.owner == market.humanPlayer ? 'friendly' : 'hostile';
    }
    if (_.isFunction(t.bonus)) {
      t.bonus = t.bonus();
    }

    this.view.render({
      human: market.currentPlayer.human,
      competitor: market.aiPlayer.company,
      tile: t,
      marketShares: market.percentMarketShare(),
      turnsLeft: market.turnsLeft,
      totalTurns: market.totalTurns,
      turnsPercent: (market.totalTurns - market.turnsLeft)/market.totalTurns * 100
    });
  }

  endGame(reason) {
    var view = new Alert({
      onDismiss: () => {
        var market = this.market;
        var marketShares = _.filter(market.humanPlayer.tiles, t => t instanceof Tile.Income),
            influencers = _.filter(market.humanPlayer.tiles, t => t instanceof Tile.Influencer);
        var results = Product.setRevenue(this.product, marketShares, influencers, this.player);
        results.marketShare = market.percentMarketShare().human;
        this.player.company.finishProduct(this.product);

        Tile.onCapture.removeAll();
        Tile.onSingleClick.removeAll();
        Tile.onDoubleClick.removeAll();

        this.view.remove();
        this.player.save();
        $('#market').removeClass('market-active');
        $('body').removeClass('market-background');

        this.game.state.states['Manage'].marketResults = results;
        this.game.state.start('Manage');
      },
      attrs: { class: 'alert market-ending-alert' }
    });
    view.render({message: reason});
  }
}

export default TheMarket;
